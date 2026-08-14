/** Formatting helpers. All DB timestamps are UTC; display is Europe/Paris. */

export const PARIS_TZ = 'Europe/Paris';

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: PARIS_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    timeZone: PARIS_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    timeZone: PARIS_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeWithSeconds(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    timeZone: PARIS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** "40 s", "3 min 20 s", "1 h 05 min" */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    if (rest === 0) return `${minutes} min`;
    return `${minutes} min ${rest} s`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours} h ${String(restMinutes).padStart(2, '0')} min`;
}

/** Compact chrono "01:23:45" or "23:45". */
export function formatChrono(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function secondsSince(iso: string, now: number = Date.now()): number {
  return (now - new Date(iso).getTime()) / 1000;
}

export function episodeDurationSeconds(startedAt: string, endedAt: string): number {
  return Math.max(0, (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
}

/** Hour of day (0-23) in Europe/Paris for a UTC timestamp. */
export function parisHour(iso: string): number {
  const hour = new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date(iso));
  return parseInt(hour, 10);
}

/** Le jour de `day` (année/mois/jour) avec l'heure de `time` (h/min). */
export function combineDayTime(day: Date, time: Date): Date {
  const result = new Date(day);
  result.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return result;
}

/**
 * Plage horaire saisie sur un jour donné : la fin est calée sur le MÊME
 * jour que le début, et si elle tombe avant (ex. 23 h 50 → 00 h 20) elle
 * passe au lendemain. La durée est donc toujours entre 0 et 24 h — fini
 * les 19 h 10 → 19 h 20 comptés un jour plus tard.
 */
export function rangeOnDay(day: Date, startTime: Date, endTime: Date): { start: Date; end: Date } {
  const start = combineDayTime(day, startTime);
  const end = combineDayTime(day, endTime);
  if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Sortable day key like "2026-07-23" on the Paris-local date. */
export function parisDayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** ISO week key like "2026-S28" computed on the Paris-local date. */
export function parisWeekKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // ISO week algorithm on a UTC date built from the Paris-local calendar date.
  const d = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(week).padStart(2, '0')}`;
}

export const KIND_LABELS: Record<string, string> = {
  bark: 'Aboiement',
  howl: 'Hurlement',
  whine: 'Gémissement',
};

/**
 * Volume d'un épisode (RMS max 0..1, mesuré par l'agent) sur une échelle
 * 1-5 lisible. Repères issus des clips réels : ~0.003 couinement discret,
 * ~0.03 aboiement net, ~0.09 aboiement très fort près de la caméra.
 */
export function formatVolume(rms: number | null | undefined): string | null {
  if (rms == null || rms <= 0) return null;
  const thresholds = [0.005, 0.015, 0.04, 0.08];
  const level = 1 + thresholds.filter((t) => rms >= t).length;
  return `VOL ${level}/5`;
}

export const ACTIVITY_LABELS: Record<string, string> = {
  walk: '🚶 Sortie',
  meal: '🍽️ Repas',
  play: '🎾 Jeu',
  mat: '🐾 Tapis',
  other: '📝 Autre',
};

export const OBSERVED_LABELS: Record<string, string> = {
  relief: '😌 Soulagement',
  sit: '🐩 Assis',
  down: '🛏 Couché',
  panic: '😰 Panique',
};
