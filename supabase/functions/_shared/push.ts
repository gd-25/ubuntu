// Envoi de notifications via l'API Expo Push (pas de FCM/APNs direct).

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendExpoPush(
  tokens: string[],
  message: PushMessage,
): Promise<void> {
  if (tokens.length === 0) {
    console.warn("sendExpoPush: aucun token push enregistré");
    return;
  }
  const payload = tokens.map((to) => ({
    to,
    sound: "default",
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  }));
  const resp = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    console.error("Expo push a échoué:", resp.status, await resp.text());
    return;
  }
  const result = await resp.json();
  console.log("Expo push:", JSON.stringify(result));
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}
