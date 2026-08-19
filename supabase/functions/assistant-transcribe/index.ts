// assistant-transcribe — dictée vocale du chat : reçoit un petit audio
// (m4a expo-audio encodé en base64), le transcrit via Voxtral et renvoie
// le texte. L'app affiche la transcription dans le champ de saisie pour
// relecture avant envoi.
//
// Appel côté app : POST { audio_base64, filename? } avec le JWT (verify_jwt).

import { transcribe } from "../_shared/mistral.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

/** ~10 Mo d'audio décodé max (largement assez pour quelques minutes de dictée). */
const MAX_BYTES = 10 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { audio_base64, filename } = await req.json();
    if (!audio_base64) {
      return Response.json({ error: "audio_base64 requis" }, { status: 400, headers: CORS });
    }
    const bytes = Uint8Array.from(atob(audio_base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > MAX_BYTES) {
      return Response.json({ error: "audio trop volumineux" }, { status: 413, headers: CORS });
    }
    const name = typeof filename === "string" && filename ? filename : "dictee.m4a";
    const text = await transcribe(new Blob([bytes]), name);
    return Response.json({ text }, { headers: CORS });
  } catch (e) {
    console.error("assistant-transcribe :", e);
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: CORS },
    );
  }
});
