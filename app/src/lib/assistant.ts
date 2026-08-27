/**
 * Client de l'assistant IA : streaming SSE de assistant-chat (via expo/fetch,
 * qui supporte les corps de réponse streamés), dictée (assistant-transcribe)
 * et validation des propositions d'entrées (insert dans activities par
 * l'utilisateur — l'assistant ne fait que proposer).
 */

import { fetch as expoFetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/lib/supabase';
import type {
  ActivityKind,
  AssistantMessage,
  Participant,
  ProposalChange,
  ProposalEntry,
  ProposalTrim,
} from '@/lib/types';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

export const PROPOSAL_KIND_LABELS: Record<ActivityKind, string> = {
  walk: '🚶 Sortie',
  meal: '🍖 Repas',
  play: '🎾 Jeu',
  mat: '🐾 Tapis',
  fake_cue: '🔑 Faux signal',
  care: '🤝 Garde',
  velcro: '🍯 Velcro',
  training: '🎓 Dressage',
  incident: '⚠️ Incident',
  health: '🩺 Santé',
  note: '🗒️ Note',
  other: '📝 Autre',
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session expirée, reconnecte-toi.');
  return {
    Authorization: `Bearer ${token}`,
    apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    'Content-Type': 'application/json',
  };
}

export interface ChatCallbacks {
  onMeta?: (meta: { conversation_id: string; user_message_id: string }) => void;
  onStatus?: (label: string) => void;
  onDelta?: (text: string) => void;
  onDone?: (message: AssistantMessage) => void;
  onError?: (message: string) => void;
}

/**
 * Envoie un message à l'assistant et consomme le flux SSE. Résout quand le
 * flux est terminé (après onDone ou onError).
 */
export async function streamChat(
  params: {
    dogId: string;
    conversationId: string | null;
    message: string;
    author: Participant;
  },
  callbacks: ChatCallbacks
): Promise<void> {
  const headers = await authHeaders();
  const response = await expoFetch(`${FUNCTIONS_URL}/assistant-chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      dog_id: params.dogId,
      conversation_id: params.conversationId ?? undefined,
      message: params.message,
      author: params.author,
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Assistant indisponible (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawTerminalEvent = false;

  const handleBlock = (block: string) => {
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (event === 'meta') callbacks.onMeta?.(payload);
    else if (event === 'status') callbacks.onStatus?.(payload.label);
    else if (event === 'delta') callbacks.onDelta?.(payload.text);
    else if (event === 'done') {
      sawTerminalEvent = true;
      callbacks.onDone?.(payload.message);
    } else if (event === 'error') {
      sawTerminalEvent = true;
      callbacks.onError?.(payload.message ?? 'Erreur inconnue');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop()!;
    for (const block of blocks) handleBlock(block);
  }
  if (buffer.trim()) handleBlock(buffer);
  if (!sawTerminalEvent) {
    callbacks.onError?.('Connexion interrompue avant la fin de la réponse.');
  }
}

/** Transcrit un enregistrement local (m4a d'expo-audio) via Voxtral. */
export async function transcribeRecording(uri: string): Promise<string> {
  const audioBase64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const headers = await authHeaders();
  const response = await expoFetch(`${FUNCTIONS_URL}/assistant-transcribe`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ audio_base64: audioBase64, filename: 'dictee.m4a' }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? `Transcription impossible (${response.status})`);
  return (json.text ?? '').trim();
}

/** Lance l'indexation d'une ressource par URL dans la bibliothèque. */
export async function ingestUrl(dogId: string, url: string, title: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('assistant-ingest-doc', {
    body: { dog_id: dogId, url, title },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

/** Relance l'indexation d'un document existant (statut pending/error). */
export async function reingestDocument(documentId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('assistant-ingest-doc', {
    body: { document_id: documentId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
}

/**
 * VALIDER : exécute les opérations proposées (insertions dans activities,
 * modifications/suppressions d'événements, clôture anticipée de session)
 * avec la session de l'utilisateur — la RLS reste le garde-fou — puis
 * marque le message. Les entrées sans `op` datent d'avant les modifications
 * et sont des insertions.
 */
export async function confirmProposals(message: AssistantMessage): Promise<void> {
  for (const proposal of message.proposals ?? []) {
    const op = proposal.op ?? 'insert';

    if (op === 'insert') {
      const entry = proposal as ProposalEntry;
      const { error } = await supabase.from('activities').insert({
        dog_id: message.dog_id,
        kind: entry.kind,
        at: entry.at,
        ended_at: entry.ended_at,
        duration_minutes: entry.duration_minutes,
        notes: entry.notes,
        commands: entry.commands,
        success_rating: entry.success_rating,
        weight_kg: entry.weight_kg,
        meal_fraction: entry.meal_fraction,
        meal_kind: entry.meal_kind ?? null,
        caregiver: entry.caregiver ?? null,
        cues: entry.cues ?? null,
        off_leash: entry.off_leash,
        poop_small: entry.poop_small,
        poop_big: entry.poop_big,
        created_via: 'assistant' as const,
      });
      if (error) throw new Error(error.message);
      continue;
    }

    if (op === 'update' || op === 'delete') {
      const change = proposal as ProposalChange;
      const query =
        op === 'update'
          ? supabase.from(change.table).update(change.fields ?? {}).eq('id', change.id)
          : supabase.from(change.table).delete().eq('id', change.id);
      const { error } = await query;
      if (error) throw new Error(`${change.label} : ${error.message}`);
      continue;
    }

    if (op === 'trim_session') {
      const trim = proposal as ProposalTrim;
      const { error: episodesError } = await supabase
        .from('vocal_episodes')
        .update({ dismissed: true })
        .eq('session_id', trim.session_id)
        .gte('started_at', trim.end_at);
      if (episodesError) throw new Error(episodesError.message);
      const { error: sessionError } = await supabase
        .from('sessions')
        .update({ ended_at: trim.end_at, returned_during_vocalization: false })
        .eq('id', trim.session_id);
      if (sessionError) throw new Error(sessionError.message);
    }
  }
  await setProposalStatus(message.id, 'confirmed');
}

export async function dismissProposals(message: AssistantMessage): Promise<void> {
  await setProposalStatus(message.id, 'dismissed');
}

async function setProposalStatus(
  messageId: string,
  status: 'confirmed' | 'dismissed'
): Promise<void> {
  const { error } = await supabase
    .from('assistant_messages')
    .update({ proposal_status: status })
    .eq('id', messageId);
  if (error) throw new Error(error.message);
}
