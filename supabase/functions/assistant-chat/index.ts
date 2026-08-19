// assistant-chat — l'expert canin de l'app. Reçoit un message utilisateur,
// assemble le contexte (fiche d'Ubuntu, mémoires pertinentes, résumé des
// sessions récentes), boucle avec Mistral en tool calling et streame la
// réponse en SSE vers l'app.
//
// Appel côté app : POST { dog_id, conversation_id?, message, author }
// avec le JWT utilisateur (verify_jwt = true, la RLS scope toutes les
// lectures/écritures). Événements SSE émis :
//   meta   {conversation_id, user_message_id}
//   status {label}                    — outil en cours, pour l'UI
//   delta  {text}                     — texte de la réponse au fil de l'eau
//   done   {message}                  — ligne assistant_messages finale
//   error  {message}
//
// Les écritures de données du foyer passent par le tool propose_entries :
// l'assistant PROPOSE, l'app affiche une carte de validation et c'est
// l'utilisateur qui insère (RLS) — l'assistant n'écrit jamais dans
// activities directement.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  CHAT_MODEL,
  SMALL_MODEL,
  chat,
  chatStream,
  embed,
  sseChunks,
  type ChatMessage,
  type ToolCall,
} from "../_shared/mistral.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 40;
const PARIS = "Europe/Paris";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

// ---------------------------------------------------------------- heure de Paris

function fmtParis(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return "?";
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: PARIS,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
}

function parisOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** "2026-08-19T08:15" (heure de Paris, sans fuseau) → ISO UTC. */
function parisToUtc(value: string): string | null {
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const guess = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)),
  );
  return new Date(guess.getTime() - parisOffsetMs(guess)).toISOString();
}

// ------------------------------------------------------------------------ tools

const ACTIVITY_KINDS = [
  "walk", "meal", "play", "mat", "fake_cue", "care", "velcro",
  "training", "incident", "health", "note", "other",
] as const;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_sessions",
      description:
        "Liste résumée des sessions de solitude (le chien seul, surveillé par la caméra) des N derniers jours : durée, épisodes de vocalises, % de calme.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", description: "Fenêtre en jours (défaut 30, max 366)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_session_detail",
      description:
        "Détail complet d'une session : chronologie des vocalises (heure, durée, type, volume), observations, notes, tags. Utiliser l'id renvoyé par get_sessions.",
      parameters: {
        type: "object",
        properties: { session_id: { type: "string" } },
        required: ["session_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activities",
      description:
        "Recherche dans le journal des activités : balades (walk), repas (meal), jeu (play), tapis (mat), faux départs (fake_cue), garde (care), pot de colle (velcro), entraînement d'ordres (training), incidents (incident), santé (health), notes libres (note). Renvoie le compte total et les lignes.",
      parameters: {
        type: "object",
        properties: {
          kinds: { type: "array", items: { type: "string", enum: [...ACTIVITY_KINDS] } },
          command: { type: "string", description: "Filtre entraînement : un ordre précis (ex. 'stop')" },
          since: { type: "string", description: "Date de début AAAA-MM-JJ" },
          until: { type: "string", description: "Date de fin AAAA-MM-JJ" },
          limit: { type: "integer", description: "Max lignes renvoyées (défaut 100)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_nights",
      description: "Les nuits d'Ubuntu (où il a dormi, notes) des N derniers jours.",
      parameters: {
        type: "object",
        properties: { days: { type: "integer", description: "Défaut 30" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exercises",
      description:
        "Exercices d'entraînement à la solitude des N derniers jours : sessions semi-solo (seul dans une pièce), exercices de dressage type protocole Overall, et les objectifs quotidiens du foyer.",
      parameters: {
        type: "object",
        properties: { days: { type: "integer", description: "Défaut 30" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_library",
      description:
        "Recherche sémantique dans la bibliothèque de documents du foyer (articles et PDF sur l'anxiété de séparation, l'éducation canine…). À utiliser pour appuyer un conseil sur une source.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Mémorise un fait durable sur Ubuntu ou le foyer (préférence, déclencheur, ce qui marche/échoue). Ne pas mémoriser ce qui est déjà enregistré comme activité.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Le fait, une phrase autonome" },
          category: { type: "string", description: "comportement | sante | entrainement | contexte" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_profile",
      description:
        "Remplace la fiche d'Ubuntu (le document de référence toujours en contexte). Réécrire la fiche COMPLÈTE en intégrant la modification, pas seulement le delta.",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_entries",
      description:
        "Propose d'enregistrer des entrées structurées dans le journal (l'utilisateur validera d'un tap). À appeler dès que l'utilisateur rapporte des faits datés : balade, repas, entraînement, incident, soin… Heures au format AAAA-MM-JJTHH:MM en HEURE DE PARIS.",
      parameters: {
        type: "object",
        properties: {
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: [...ACTIVITY_KINDS] },
                at: { type: "string", description: "Début, AAAA-MM-JJTHH:MM heure de Paris" },
                ended_at: { type: "string", description: "Fin éventuelle, même format" },
                duration_minutes: { type: "integer" },
                notes: { type: "string", description: "Description courte en français" },
                commands: {
                  type: "array",
                  items: { type: "string" },
                  description: "training : ordres travaillés en minuscules (assis, stop, rappel…)",
                },
                success_rating: { type: "integer", description: "training : réussite 1-5" },
                weight_kg: { type: "number", description: "health : poids si pesée" },
                meal_fraction: { type: "number", description: "meal : fraction de ration (0.25-1)" },
                off_leash: { type: "boolean", description: "walk : lâché en liberté" },
                poop_small: { type: "boolean" },
                poop_big: { type: "boolean" },
              },
              required: ["kind", "at"],
            },
          },
        },
        required: ["entries"],
      },
    },
  },
] as const;

interface ProposalEntry {
  kind: string;
  at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  commands: string[] | null;
  success_rating: number | null;
  weight_kg: number | null;
  meal_fraction: number | null;
  off_leash: boolean | null;
  poop_small: boolean | null;
  poop_big: boolean | null;
}

const TOOL_STATUS: Record<string, string> = {
  get_sessions: "Consulte les sessions…",
  get_session_detail: "Analyse la session…",
  get_activities: "Fouille le journal…",
  get_nights: "Regarde les nuits…",
  get_exercises: "Regarde les exercices…",
  search_library: "Cherche dans la bibliothèque…",
  save_memory: "Mémorise…",
  update_profile: "Met à jour la fiche…",
  propose_entries: "Prépare une proposition…",
};

// --------------------------------------------------------------- exécution tools

async function runTool(
  db: SupabaseClient,
  dogId: string,
  author: string,
  name: string,
  args: Record<string, any>,
  pendingProposals: ProposalEntry[],
): Promise<string> {
  if (name === "get_sessions") {
    const days = Math.min(Number(args.days) || 30, 366);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await db
      .from("session_summaries")
      .select("*")
      .eq("dog_id", dogId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(80);
    if (error) return `Erreur : ${error.message}`;
    const rows = (data ?? []).map((s: Record<string, any>) => ({
      id: s.session_id,
      debut: fmtParis(s.started_at),
      duree_min: s.ended_at
        ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000)
        : null,
      en_cours: !s.ended_at || undefined,
      type: s.solitude_type,
      exercice: s.is_exercise,
      depart: s.departure_type,
      etat_au_depart: s.departure_state,
      episodes: s.episode_count,
      vocalises_s: Math.round(s.total_vocal_seconds),
      calme_pct: s.calm_percent,
      premiere_vocalise_apres_s: s.time_to_first_vocalization_seconds,
      retour_pendant_vocalise: s.returned_during_vocalization,
    }));
    return JSON.stringify({ nb: rows.length, sessions: rows });
  }

  if (name === "get_session_detail") {
    const id = String(args.session_id ?? "");
    const { data: session, error } = await db
      .from("sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !session) return "Session introuvable.";
    const [{ data: episodes }, { data: events }, { data: tagRows }, { data: summary }] =
      await Promise.all([
        db
          .from("vocal_episodes")
          .select("started_at, ended_at, kind, peak_rms")
          .eq("session_id", id)
          .eq("dismissed", false)
          .order("started_at", { ascending: true })
          .limit(300),
        db
          .from("observed_events")
          .select("kind, at")
          .eq("session_id", id)
          .order("at", { ascending: true }),
        db.from("session_tags").select("tags(label)").eq("session_id", id),
        db.from("session_summaries").select("*").eq("session_id", id).maybeSingle(),
      ]);
    return JSON.stringify({
      debut: fmtParis(session.started_at, true),
      fin: fmtParis(session.ended_at, true),
      type: session.solitude_type,
      exercice: session.is_exercise,
      participants: session.participants,
      depart: session.departure_type,
      etat_au_depart: session.departure_state,
      retour_pendant_vocalise: session.returned_during_vocalization,
      notes: session.notes,
      tags: (tagRows ?? []).map((t: Record<string, any>) => t.tags?.label).filter(Boolean),
      resume: summary && {
        episodes: summary.episode_count,
        vocalises_s: Math.round(summary.total_vocal_seconds),
        calme_pct: summary.calm_percent,
        plus_long_episode_s: summary.longest_episode_seconds,
        premiere_vocalise_apres_s: summary.time_to_first_vocalization_seconds,
      },
      observations: (events ?? []).map((e: Record<string, any>) => ({
        quoi: e.kind,
        quand: fmtParis(e.at, true),
      })),
      vocalises: (episodes ?? []).map((e: Record<string, any>) => ({
        debut: new Date(e.started_at).toLocaleTimeString("fr-FR", { timeZone: PARIS }),
        duree_s: Math.round((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 1000),
        type: e.kind,
        vol_rms: e.peak_rms,
      })),
    });
  }

  if (name === "get_activities") {
    let query = db
      .from("activities")
      .select(
        "kind, at, ended_at, duration_minutes, notes, commands, success_rating, weight_kg, meal_fraction, meal_kind, off_leash, poop_small, poop_big, cues, caregiver",
        { count: "exact" },
      )
      .eq("dog_id", dogId)
      .order("at", { ascending: false })
      .limit(Math.min(Number(args.limit) || 100, 200));
    if (Array.isArray(args.kinds) && args.kinds.length > 0) query = query.in("kind", args.kinds);
    if (args.command) query = query.contains("commands", [String(args.command).toLowerCase()]);
    if (args.since) query = query.gte("at", `${args.since}T00:00:00+02:00`);
    if (args.until) query = query.lte("at", `${args.until}T23:59:59+02:00`);
    const { data, count, error } = await query;
    if (error) return `Erreur : ${error.message}`;
    const rows = (data ?? []).map((a: Record<string, any>) => {
      const row: Record<string, unknown> = { kind: a.kind, quand: fmtParis(a.at) };
      if (a.ended_at) row.fin = fmtParis(a.ended_at);
      if (a.duration_minutes) row.duree_min = a.duration_minutes;
      if (a.notes) row.notes = String(a.notes).slice(0, 300);
      if (a.commands?.length) row.ordres = a.commands;
      if (a.success_rating) row.reussite = a.success_rating;
      if (a.weight_kg) row.poids_kg = a.weight_kg;
      if (a.meal_fraction) row.ration = a.meal_fraction;
      if (a.meal_kind) row.repas = a.meal_kind;
      if (a.off_leash != null) row.liberte = a.off_leash;
      if (a.cues?.length) row.faux_signaux = a.cues;
      if (a.caregiver) row.garde_par = a.caregiver;
      return row;
    });
    return JSON.stringify({ total: count ?? rows.length, lignes_renvoyees: rows.length, activites: rows });
  }

  if (name === "get_nights") {
    const days = Math.min(Number(args.days) || 30, 366);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await db
      .from("nights")
      .select("started_at, ended_at, location, notes")
      .eq("dog_id", dogId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(60);
    if (error) return `Erreur : ${error.message}`;
    return JSON.stringify(
      (data ?? []).map((n: Record<string, any>) => ({
        nuit_du: fmtParis(n.started_at),
        ou: n.location,
        notes: n.notes,
      })),
    );
  }

  if (name === "get_exercises") {
    const days = Math.min(Number(args.days) || 30, 366);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const [{ data: semiSolo }, { data: overalls }, { data: goals }] = await Promise.all([
      db
        .from("semi_solo_sessions")
        .select("started_at, ended_at, notes")
        .eq("dog_id", dogId)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(60),
      db
        .from("overall_sessions")
        .select("at, duration_minutes, treats_count, notes")
        .eq("dog_id", dogId)
        .gte("at", since)
        .order("at", { ascending: false })
        .limit(60),
      db.from("dog_goals").select("*").eq("dog_id", dogId).maybeSingle(),
    ]);
    return JSON.stringify({
      objectifs_quotidiens: goals,
      semi_solo: (semiSolo ?? []).map((s: Record<string, any>) => ({
        debut: fmtParis(s.started_at),
        duree_min: Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000),
        notes: s.notes,
      })),
      exercices_dressage: (overalls ?? []).map((o: Record<string, any>) => ({
        quand: fmtParis(o.at),
        duree_min: o.duration_minutes,
        friandises: o.treats_count,
        notes: o.notes,
      })),
    });
  }

  if (name === "search_library") {
    const [vector] = await embed([String(args.query ?? "")]);
    const { data, error } = await db.rpc("match_library_chunks", {
      dog: dogId,
      query_embedding: JSON.stringify(vector),
      match_count: 6,
    });
    if (error) return `Erreur : ${error.message}`;
    if (!data?.length) return "Bibliothèque vide ou aucun passage pertinent.";
    return JSON.stringify(
      data.map((c: Record<string, any>) => ({
        document: c.title,
        extrait: String(c.content).slice(0, 1500),
        pertinence: Math.round(c.similarity * 100) / 100,
      })),
    );
  }

  if (name === "save_memory") {
    const content = String(args.content ?? "").trim();
    if (!content) return "Contenu vide, rien à mémoriser.";
    const [vector] = await embed([content]);
    const { error } = await db.from("assistant_memories").insert({
      dog_id: dogId,
      content,
      category: args.category ?? null,
      embedding: JSON.stringify(vector),
    });
    return error ? `Erreur : ${error.message}` : "Mémorisé.";
  }

  if (name === "update_profile") {
    const content = String(args.content ?? "").trim();
    if (!content) return "Fiche vide refusée.";
    const { error } = await db
      .from("assistant_profiles")
      .upsert({ dog_id: dogId, content, updated_by: author, updated_at: new Date().toISOString() });
    return error ? `Erreur : ${error.message}` : "Fiche mise à jour.";
  }

  if (name === "propose_entries") {
    const entries = Array.isArray(args.entries) ? args.entries.slice(0, 10) : [];
    const normalized: ProposalEntry[] = [];
    const rejected: string[] = [];
    for (const e of entries) {
      const kind = String(e?.kind ?? "");
      const at = e?.at ? parisToUtc(String(e.at)) : null;
      if (!ACTIVITY_KINDS.includes(kind as (typeof ACTIVITY_KINDS)[number]) || !at) {
        rejected.push(`${kind || "?"} (kind ou date invalide)`);
        continue;
      }
      normalized.push({
        kind,
        at,
        ended_at: e.ended_at ? parisToUtc(String(e.ended_at)) : null,
        duration_minutes: Number.isFinite(e.duration_minutes) ? Math.round(e.duration_minutes) : null,
        notes: e.notes ? String(e.notes).slice(0, 500) : null,
        commands: Array.isArray(e.commands)
          ? e.commands.map((c: unknown) => String(c).toLowerCase().trim()).filter(Boolean)
          : null,
        success_rating:
          Number.isFinite(e.success_rating) && e.success_rating >= 1 && e.success_rating <= 5
            ? Math.round(e.success_rating)
            : null,
        weight_kg: Number.isFinite(e.weight_kg) && e.weight_kg > 0 ? e.weight_kg : null,
        meal_fraction:
          Number.isFinite(e.meal_fraction) && e.meal_fraction > 0 && e.meal_fraction <= 1
            ? e.meal_fraction
            : null,
        off_leash: typeof e.off_leash === "boolean" ? e.off_leash : null,
        poop_small: typeof e.poop_small === "boolean" ? e.poop_small : null,
        poop_big: typeof e.poop_big === "boolean" ? e.poop_big : null,
      });
    }
    pendingProposals.push(...normalized);
    if (normalized.length === 0) return `Aucune entrée valide (${rejected.join(", ")}).`;
    return (
      `${normalized.length} entrée(s) prête(s) — une carte de validation s'affiche à l'utilisateur. ` +
      `Confirme brièvement sans re-détailler chaque entrée.` +
      (rejected.length ? ` Rejetées : ${rejected.join(", ")}.` : "")
    );
  }

  return `Outil inconnu : ${name}`;
}

// ------------------------------------------------------------ contexte système

async function buildSystemPrompt(
  db: SupabaseClient,
  dogId: string,
  dogName: string,
  author: string,
  userMessage: string,
): Promise<string> {
  const [profileRes, memoriesVector, summariesRes] = await Promise.all([
    db.from("assistant_profiles").select("content").eq("dog_id", dogId).maybeSingle(),
    embed([userMessage]).catch(() => [null]),
    db
      .from("session_summaries")
      .select("started_at, ended_at, episode_count, total_vocal_seconds, calm_percent, is_exercise, departure_type")
      .eq("dog_id", dogId)
      .gte("started_at", new Date(Date.now() - 21 * 86_400_000).toISOString())
      .order("started_at", { ascending: false })
      .limit(30),
  ]);

  let memories: { content: string; category: string | null }[] = [];
  const vector = memoriesVector[0];
  if (vector) {
    const { data } = await db.rpc("match_assistant_memories", {
      dog: dogId,
      query_embedding: JSON.stringify(vector),
      match_count: 12,
    });
    memories = data ?? [];
  }

  const now = new Date().toLocaleString("fr-FR", {
    timeZone: PARIS,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sessionLines = (summariesRes.data ?? [])
    .map((s: Record<string, any>) => {
      const mins = s.ended_at
        ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000)
        : null;
      return `- ${fmtParis(s.started_at)} : ${mins != null ? `${mins} min` : "en cours"}, ${s.episode_count} épisode(s), ${Math.round(s.total_vocal_seconds)} s de vocalises, ${s.calm_percent}% calme${s.is_exercise ? "" : " (absence subie)"}`;
    })
    .join("\n");

  const memoryLines = memories
    .map((m) => `- ${m.content}${m.category ? ` [${m.category}]` : ""}`)
    .join("\n");

  return `Tu es l'expert canin du foyer : un éducateur comportementaliste chaleureux, spécialiste de l'anxiété de séparation et des chiens qui gèrent mal la solitude. Tu accompagnes Greg et Fiona avec leur chien ${dogName} (surnom : Boubou), suivi par une caméra quand il est seul (sessions de solitude, vocalises détectées automatiquement).

Nous sommes le ${now} (heure de Paris). Tu parles avec ${author === "fiona" ? "Fiona" : "Greg"}. Réponds en français, tutoie, reste concret et encourageant sans complaisance. Réponses courtes par défaut ; détaillé seulement si on te demande une analyse. TEXTE BRUT uniquement : pas de gras, pas de titres markdown ; les listes avec des tirets simples sont permises.

FICHE DE ${dogName.toUpperCase()} (référence, maintenue par toi via update_profile) :
${profileRes.data?.content?.trim() || "(fiche vide — remplis-la avec update_profile dès que tu apprends des choses)"}

MÉMOIRES PERTINENTES (faits déjà appris) :
${memoryLines || "(aucune)"}

SESSIONS DE SOLITUDE DES 21 DERNIERS JOURS :
${sessionLines || "(aucune)"}

RÈGLES :
- Utilise les outils pour toute question factuelle (sessions, journal, stats) au lieu de deviner. Pour analyser une session précise, get_sessions puis get_session_detail.
- Dès que l'utilisateur RAPPORTE des faits datés (balade, repas, entraînement d'ordres, incident, soin, pesée…), appelle propose_entries dans le même tour — c'est lui qui valide, toi tu proposes. Une balade racontée = une entrée walk ; des ordres travaillés pendant la balade = une entrée training séparée avec commands ; un incident marquant = une entrée incident. Ce qui ne rentre dans aucune case = note.
- Mémorise avec save_memory les faits durables (déclencheurs, préférences, ce qui marche) — pas les événements ponctuels, qui vont dans propose_entries.
- Appuie tes conseils sur search_library quand la question s'y prête, et cite le document.
- Ne prescris jamais de médicament ; pour le médical sérieux, renvoie au vétérinaire.
- RAPPEL FORMAT : jamais de markdown. Pas de **gras**, pas de *italique*, pas de ## titres, pas de tableaux — la police pixel de l'app affiche les astérisques tels quels. Texte brut, tirets simples pour les listes.`;
}

// ------------------------------------------------------------- tâches d'arrière-plan

async function generateTitle(db: SupabaseClient, conversationId: string, userMessage: string) {
  try {
    const res = await chat({
      model: SMALL_MODEL,
      messages: [
        {
          role: "user",
          content: `Donne un titre de 3 à 5 mots (sans guillemets, sans point final) pour une conversation qui commence par : "${userMessage.slice(0, 400)}"`,
        },
      ],
      max_tokens: 30,
    });
    const title = res.choices?.[0]?.message?.content?.trim()?.replace(/^"|"$/g, "");
    if (title) {
      await db.from("assistant_conversations").update({ title: title.slice(0, 80) }).eq("id", conversationId);
    }
  } catch (e) {
    console.error("titre :", e);
  }
}

async function extractMemories(
  db: SupabaseClient,
  dogId: string,
  conversationId: string,
  author: string,
  userMessage: string,
  assistantReply: string,
) {
  try {
    const { data: existing } = await db
      .from("assistant_memories")
      .select("content")
      .eq("dog_id", dogId)
      .order("created_at", { ascending: false })
      .limit(40);
    const known = (existing ?? []).map((m: { content: string }) => `- ${m.content}`).join("\n");
    const res = await chat({
      model: SMALL_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Tu extrais des FAITS DURABLES sur un chien (Ubuntu) et son foyer à partir d'un échange, pour la mémoire long terme d'un assistant. Un fait durable = déclencheur, préférence, trait de caractère, méthode qui marche/échoue, info santé de fond. PAS les événements ponctuels ni les questions. Réponds en JSON : {"memories": [{"content": "...", "category": "comportement|sante|entrainement|contexte"}]} — 0 à 3 faits, phrases autonomes en français. Ne répète pas les faits déjà connus :\n${known || "(aucun)"}`,
        },
        {
          role: "user",
          content: `${author === "fiona" ? "Fiona" : "Greg"} : ${userMessage.slice(0, 1500)}\n\nAssistant : ${assistantReply.slice(0, 1500)}`,
        },
      ],
      max_tokens: 400,
    });
    const parsed = JSON.parse(res.choices?.[0]?.message?.content ?? "{}");
    const memories = (Array.isArray(parsed.memories) ? parsed.memories : [])
      .map((m: Record<string, unknown>) => ({
        content: String(m.content ?? "").trim(),
        category: m.category ? String(m.category) : null,
      }))
      .filter((m: { content: string }) => m.content.length > 8)
      .slice(0, 3);
    if (memories.length === 0) return;
    const vectors = await embed(memories.map((m: { content: string }) => m.content));
    await db.from("assistant_memories").insert(
      memories.map((m: { content: string; category: string | null }, i: number) => ({
        dog_id: dogId,
        content: m.content,
        category: m.category,
        source_conversation_id: conversationId,
        embedding: JSON.stringify(vectors[i]),
      })),
    );
  } catch (e) {
    console.error("extraction mémoire :", e);
  }
}

// ---------------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const { dog_id, conversation_id, message, author } = await req.json();
  if (!dog_id || !message?.trim()) {
    return Response.json({ error: "dog_id et message requis" }, { status: 400, headers: CORS });
  }
  const who = author === "fiona" ? "fiona" : "greg";

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );

  // La RLS ne renvoie le chien qu'à ses membres : sert aussi de contrôle d'accès.
  const { data: dog } = await db.from("dogs").select("id, name").eq("id", dog_id).maybeSingle();
  if (!dog) return Response.json({ error: "chien introuvable" }, { status: 404, headers: CORS });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      (async () => {
        // Conversation : existante ou créée à la volée.
        let convId = conversation_id as string | undefined;
        let isNewConversation = false;
        if (convId) {
          const { data: conv } = await db
            .from("assistant_conversations")
            .select("id, title")
            .eq("id", convId)
            .maybeSingle();
          if (!conv) throw new Error("conversation introuvable");
          isNewConversation = !conv.title;
        } else {
          const { data: conv, error } = await db
            .from("assistant_conversations")
            .insert({ dog_id, created_by: who })
            .select("id")
            .single();
          if (error) throw error;
          convId = conv.id;
          isNewConversation = true;
        }

        // Historique AVANT d'insérer le nouveau message.
        const { data: historyDesc } = await db
          .from("assistant_messages")
          .select("role, content, author")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(HISTORY_LIMIT);
        const history = (historyDesc ?? []).reverse();

        const { data: userMsg, error: userMsgError } = await db
          .from("assistant_messages")
          .insert({ conversation_id: convId, dog_id, role: "user", content: message, author: who })
          .select("id")
          .single();
        if (userMsgError) throw userMsgError;
        send("meta", { conversation_id: convId, user_message_id: userMsg.id });

        const system = await buildSystemPrompt(db, dog_id, dog.name, who, message);
        const messages: ChatMessage[] = [
          { role: "system", content: system },
          ...history.map((m: Record<string, any>): ChatMessage => ({
            role: m.role,
            content:
              m.role === "user" ? `[${m.author === "fiona" ? "Fiona" : "Greg"}] ${m.content}` : m.content,
          })),
          { role: "user", content: `[${who === "fiona" ? "Fiona" : "Greg"}] ${message}` },
        ];

        const pendingProposals: ProposalEntry[] = [];
        let finalText = "";

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const res = await chatStream({
            model: CHAT_MODEL,
            messages,
            tools: TOOLS,
            tool_choice: "auto",
            temperature: 0.4,
            max_tokens: 1500,
          });

          let roundText = "";
          const toolCalls: ToolCall[] = [];
          for await (const chunk of sseChunks(res)) {
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;
            if (typeof delta.content === "string" && delta.content) {
              roundText += delta.content;
              send("delta", { text: delta.content });
            }
            for (const tc of delta.tool_calls ?? []) {
              const index = tc.index ?? toolCalls.length;
              if (!toolCalls[index]) {
                toolCalls[index] = { id: tc.id ?? `call_${index}`, function: { name: "", arguments: "" } };
              }
              if (tc.id) toolCalls[index].id = tc.id;
              if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
            }
          }

          if (roundText) finalText += (finalText ? "\n\n" : "") + roundText;
          const calls = toolCalls.filter(Boolean);
          if (calls.length === 0) break;

          messages.push({ role: "assistant", content: roundText, tool_calls: calls });
          for (const call of calls) {
            send("status", { label: TOOL_STATUS[call.function.name] ?? "Réfléchit…" });
            let args: Record<string, any> = {};
            try {
              args = JSON.parse(call.function.arguments || "{}");
            } catch {
              // arguments illisibles : l'outil recevra un objet vide
            }
            let result: string;
            try {
              result = await runTool(db, dog_id, who, call.function.name, args, pendingProposals);
            } catch (e) {
              result = `Erreur d'exécution : ${e instanceof Error ? e.message : e}`;
            }
            messages.push({
              role: "tool",
              name: call.function.name,
              tool_call_id: call.id,
              content: result.slice(0, 40_000),
            });
          }
        }

        if (!finalText.trim()) {
          finalText = pendingProposals.length
            ? "J'ai préparé une proposition d'enregistrement, valide-la ci-dessous."
            : "Je n'ai pas réussi à formuler de réponse, réessaie.";
          send("delta", { text: finalText });
        }

        const { data: assistantMsg, error: insertError } = await db
          .from("assistant_messages")
          .insert({
            conversation_id: convId,
            dog_id,
            role: "assistant",
            content: finalText,
            proposals: pendingProposals.length ? pendingProposals : null,
            proposal_status: pendingProposals.length ? "pending" : null,
          })
          .select("*")
          .single();
        if (insertError) throw insertError;
        send("done", { message: assistantMsg });

        EdgeRuntime.waitUntil(
          Promise.allSettled([
            isNewConversation ? generateTitle(db, convId!, message) : Promise.resolve(),
            extractMemories(db, dog_id, convId!, who, message, finalText),
          ]),
        );
      })()
        .catch((e) => {
          console.error("assistant-chat :", e);
          send("error", { message: e instanceof Error ? e.message : String(e) });
        })
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
