/**
 * Mapping temporel de la frise des vocalises.
 *
 * Échelle « octave » (panneau live) : la dernière minute occupe la moitié
 * droite de la piste (linéaire), puis chaque doublement d'ancienneté
 * (1-2 min, 2-4, 4-8…) occupe une bande de largeur égale dans la moitié
 * gauche. Le présent avance au pixel près, le passé se compresse sans
 * disparaître : une session de 4 h ne compte que 8 octaves.
 */

const LAST_MINUTE_MS = 60_000;

/** Nombre d'octaves nécessaires pour couvrir `spanMs` (au moins 1). */
export function octaveCount(spanMs: number): number {
  if (spanMs <= LAST_MINUTE_MS) return 1;
  return Math.max(1, Math.ceil(Math.log2(spanMs / LAST_MINUTE_MS)));
}

/**
 * Position x (0..width) d'un instant vieux de `ageMs` par rapport au bord
 * droit de la piste. Sessions ≤ 2 min : tout tient dans une échelle
 * linéaire simple (l'octave n'apporte rien).
 */
export function octaveX(ageMs: number, spanMs: number, width: number): number {
  const age = Math.min(Math.max(ageMs, 0), spanMs);
  if (spanMs <= 2 * LAST_MINUTE_MS) {
    return width - (age / Math.max(spanMs, 1000)) * width;
  }
  const half = width / 2;
  if (age <= LAST_MINUTE_MS) {
    return width - (age / LAST_MINUTE_MS) * half;
  }
  const octaves = octaveCount(spanMs);
  const k = Math.log2(age / LAST_MINUTE_MS); // 0..octaves
  return Math.max(0, half - (k / octaves) * half);
}

/** Anciennetés (ms) des frontières d'octaves à marquer : 1, 2, 4, 8… min. */
export function octaveBoundaries(spanMs: number): number[] {
  if (spanMs <= 2 * LAST_MINUTE_MS) return [];
  const boundaries: number[] = [];
  for (let age = LAST_MINUTE_MS; age < spanMs; age *= 2) boundaries.push(age);
  return boundaries;
}

/**
 * Hauteur relative (0..1) d'un segment selon son volume (peak_rms 0..1).
 * Échelle log entre ~0.003 (couinement discret) et 0.08 (aboiement fort) —
 * mêmes repères que formatVolume(). Sans mesure (épisode manuel) : 0.55.
 */
export function volumeFraction(peakRms: number | null | undefined): number {
  if (peakRms == null || peakRms <= 0) return 0.55;
  const MIN_RMS = 0.003;
  const MAX_RMS = 0.08;
  const t = Math.log(peakRms / MIN_RMS) / Math.log(MAX_RMS / MIN_RMS);
  return Math.min(1, Math.max(0.18, 0.18 + 0.82 * t));
}
