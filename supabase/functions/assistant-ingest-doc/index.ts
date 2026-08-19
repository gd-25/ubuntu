// assistant-ingest-doc — alimente la bibliothèque RAG. Deux modes :
//   { url, title, dog_id }  : télécharge la ressource (PDF, page web, texte),
//                             la range dans le bucket `library` et l'indexe.
//   { document_id }         : (ré)indexe un document déjà présent dans le
//                             bucket (déposé via le dashboard par exemple).
// Indexation : extraction du texte, découpage en chunks (~1600 caractères,
// chevauchement 250), embeddings mistral-embed, insertion dans library_chunks.
// Tout passe par le client "utilisateur" (JWT) : la RLS scope au foyer.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf";
import { embed } from "../_shared/mistral.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

const CHUNK_SIZE = 1600;
const CHUNK_OVERLAP = 250;
const EMBED_BATCH = 32;
const MAX_CHUNKS = 1200;

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function toText(bytes: Uint8Array, contentType: string, path: string): Promise<string> {
  const isPdf =
    contentType.includes("pdf") ||
    path.toLowerCase().endsWith(".pdf") ||
    (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46); // %PDF
  if (isPdf) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (contentType.includes("html") || /^\s*</.test(raw)) return htmlToText(raw);
  return raw;
}

/** Découpe en chunks avec chevauchement, en préférant couper sur un saut de ligne. */
function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const nl = clean.lastIndexOf("\n", end);
      if (nl > start + CHUNK_SIZE / 2) end = nl;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk.length > 40) chunks.push(chunk);
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

async function indexDocument(db: SupabaseClient, doc: Record<string, any>): Promise<number> {
  await db.from("library_documents").update({ status: "processing", error: null }).eq("id", doc.id);
  const { data: blob, error: downloadError } = await db.storage
    .from("library")
    .download(doc.storage_path);
  if (downloadError || !blob) {
    throw new Error(`téléchargement impossible : ${downloadError?.message ?? "fichier absent"}`);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = await toText(bytes, blob.type ?? "", doc.storage_path);
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("aucun texte exploitable dans le document");

  // Réindexation : on repart de zéro.
  await db.from("library_chunks").delete().eq("document_id", doc.id);

  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vectors = await embed(batch);
    const { error } = await db.from("library_chunks").insert(
      batch.map((content, j) => ({
        document_id: doc.id,
        dog_id: doc.dog_id,
        chunk_index: i + j,
        content,
        embedding: JSON.stringify(vectors[j]),
      })),
    );
    if (error) throw new Error(`insertion chunks : ${error.message}`);
  }

  await db
    .from("library_documents")
    .update({ status: "ready", chunk_count: chunks.length })
    .eq("id", doc.id);
  return chunks.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );

  let docId: string | null = null;
  try {
    const { document_id, url, title, dog_id } = await req.json();

    let doc: Record<string, any> | null = null;
    if (document_id) {
      const { data } = await db.from("library_documents").select("*").eq("id", document_id).maybeSingle();
      if (!data) return Response.json({ error: "document introuvable" }, { status: 404, headers: CORS });
      doc = data;
    } else if (url && dog_id) {
      if (!/^https?:\/\//i.test(url)) {
        return Response.json({ error: "URL http(s) requise" }, { status: 400, headers: CORS });
      }
      const res = await fetch(url, { headers: { "User-Agent": "ubuntu-dog-app/1.0" } });
      if (!res.ok) {
        return Response.json({ error: `téléchargement ${res.status}` }, { status: 422, headers: CORS });
      }
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > 30 * 1024 * 1024) {
        return Response.json({ error: "document trop volumineux (30 Mo max)" }, { status: 413, headers: CORS });
      }
      const cleanTitle = String(title ?? "").trim() || url.replace(/^https?:\/\//, "").slice(0, 80);
      const ext = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf") ? "pdf" : "txt";
      const { data: created, error: createError } = await db
        .from("library_documents")
        .insert({ dog_id, title: cleanTitle, storage_path: "pending", source_url: url })
        .select("*")
        .single();
      if (createError) throw createError;
      const path = `${dog_id}/${created.id}.${ext}`;
      const { error: uploadError } = await db.storage
        .from("library")
        .upload(path, bytes, { contentType, upsert: true });
      if (uploadError) throw new Error(`upload : ${uploadError.message}`);
      await db.from("library_documents").update({ storage_path: path }).eq("id", created.id);
      doc = { ...created, storage_path: path };
    } else {
      return Response.json(
        { error: "document_id, ou url + dog_id, requis" },
        { status: 400, headers: CORS },
      );
    }

    docId = doc!.id;
    const chunkCount = await indexDocument(db, doc!);
    return Response.json({ document_id: docId, chunks: chunkCount }, { headers: CORS });
  } catch (e) {
    console.error("assistant-ingest-doc :", e);
    const message = e instanceof Error ? e.message : String(e);
    if (docId) {
      await db
        .from("library_documents")
        .update({ status: "error", error: message.slice(0, 500) })
        .eq("id", docId);
    }
    return Response.json({ error: message }, { status: 500, headers: CORS });
  }
});
