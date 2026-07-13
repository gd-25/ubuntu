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
