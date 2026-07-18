import type { Person, SolitudeType, Space } from '@/lib/types';

/**
 * Géométrie du plan de la maison (repère « carte » en unités fixes,
 * mis à l'échelle à la largeur de l'écran) et règles de la vie de famille.
 *
 *   DEHORS  (forêt)
 *   BALCON
 *   BUREAU | CHAMBRE | SALON
 */

export const MAP_W = 360;
export const MAP_H = 640;

/** Frontières horizontales des bandes. */
export const OUTSIDE_BOTTOM = 220;
export const BALCONY_BOTTOM = 290;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zones de hit-test (l'aimant s'active dès qu'on lâche l'avatar dedans). */
export const ZONES: Record<Space, Rect> = {
  dehors: { x: 0, y: 0, w: MAP_W, h: OUTSIDE_BOTTOM },
  balcon: { x: 0, y: OUTSIDE_BOTTOM, w: MAP_W, h: BALCONY_BOTTOM - OUTSIDE_BOTTOM },
  bureau: { x: 0, y: BALCONY_BOTTOM, w: 120, h: MAP_H - BALCONY_BOTTOM },
  chambre: { x: 120, y: BALCONY_BOTTOM, w: 120, h: MAP_H - BALCONY_BOTTOM },
  salon: { x: 240, y: BALCONY_BOTTOM, w: 120, h: MAP_H - BALCONY_BOTTOM },
};

export const SPACE_LABELS: Record<Space, string> = {
  dehors: 'DEHORS',
  balcon: 'BALCON',
  bureau: 'BUREAU',
  chambre: 'CHAMBRE',
  salon: 'SALON',
};

/**
 * Point d'ancrage (centre de l'avatar) par personne et par zone : chacun a
 * son emplacement fixe pour que les avatars ne se recouvrent jamais.
 */
export const SLOTS: Record<Space, Record<Person, { x: number; y: number }>> = {
  dehors: {
    greg: { x: 80, y: 150 },
    fiona: { x: 180, y: 112 },
    ubuntu: { x: 272, y: 156 },
  },
  balcon: {
    greg: { x: 70, y: 258 },
    fiona: { x: 180, y: 258 },
    ubuntu: { x: 286, y: 260 },
  },
  bureau: {
    greg: { x: 38, y: 450 },
    fiona: { x: 90, y: 400 },
    ubuntu: { x: 62, y: 546 },
  },
  chambre: {
    greg: { x: 152, y: 450 },
    fiona: { x: 208, y: 400 },
    ubuntu: { x: 180, y: 546 },
  },
  salon: {
    greg: { x: 270, y: 450 },
    fiona: { x: 326, y: 400 },
    ubuntu: { x: 296, y: 528 },
  },
};

/** Zone contenant le point (x, y) — coordonnées carte. */
export function spaceAt(x: number, y: number): Space {
  if (y < OUTSIDE_BOTTOM) return 'dehors';
  if (y < BALCONY_BOTTOM) return 'balcon';
  if (x < 120) return 'bureau';
  if (x < 240) return 'chambre';
  return 'salon';
}

export type Positions = Record<Person, Space>;

export const DEFAULT_POSITIONS: Positions = {
  greg: 'salon',
  fiona: 'salon',
  ubuntu: 'salon',
};

/**
 * Ubuntu est-il seul ? Vrai s'il est dans la maison (pas en balade)
 * sans aucun humain dans le même espace.
 */
export function isUbuntuAlone(positions: Positions): boolean {
  if (positions.ubuntu === 'dehors') return false;
  return positions.greg !== positions.ubuntu && positions.fiona !== positions.ubuntu;
}

/** Type de solitude : partis de la maison, ou isolé dans une pièce. */
export function solitudeTypeOf(positions: Positions): SolitudeType {
  if (positions.greg === 'dehors' && positions.fiona === 'dehors') return 'away';
  return 'in_home';
}

export interface Transition {
  /** Ubuntu vient de sortir → début de balade. */
  walkStarted: boolean;
  /** Ubuntu vient de rentrer → fin de balade. */
  walkEnded: boolean;
  /** Ubuntu vient de se retrouver seul. */
  aloneStarted: boolean;
  /** Quelqu'un vient de retrouver Ubuntu. */
  aloneEnded: boolean;
  solitudeType: SolitudeType;
}

/** Compare deux états du plan et décrit ce qui vient de se passer. */
export function computeTransition(prev: Positions, next: Positions): Transition {
  const wasAlone = isUbuntuAlone(prev);
  const alone = isUbuntuAlone(next);
  return {
    walkStarted: prev.ubuntu !== 'dehors' && next.ubuntu === 'dehors',
    walkEnded: prev.ubuntu === 'dehors' && next.ubuntu !== 'dehors',
    aloneStarted: !wasAlone && alone,
    aloneEnded: wasAlone && !alone,
    solitudeType: solitudeTypeOf(next),
  };
}
