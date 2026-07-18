import type { Person, SolitudeType, Space } from '@/lib/types';

/**
 * Géométrie du plan (repère « carte » en unités fixes, mis à l'échelle à
 * l'écran) et règles de la vie de famille.
 *
 *   DEHORS   (forêt, sentier en L le long du balcon)
 *   BALCON   (béton)
 *   BUREAU  | CHAMBRE | SALON
 *   SDB     | COULOIR INT
 *   COULOIR EXT (palier, moquette noire)
 */

export const MAP_W = 360;
export const MAP_H = 700;

/** Frontières horizontales des bandes hautes. */
export const OUTSIDE_BOTTOM = 250;
export const BALCONY_BOTTOM = 310;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Zones de hit-test (l'aimant s'active dès qu'on lâche l'avatar dedans).
 * Elles pavent exactement toute la carte — la détection de zone dans les
 * worklets de geste itère sur cet objet.
 */
export const ZONES: Record<Space, Rect> = {
  dehors: { x: 0, y: 0, w: MAP_W, h: OUTSIDE_BOTTOM },
  balcon: { x: 0, y: OUTSIDE_BOTTOM, w: MAP_W, h: BALCONY_BOTTOM - OUTSIDE_BOTTOM },
  bureau: { x: 0, y: 310, w: 100, h: 210 },
  sdb: { x: 0, y: 520, w: 100, h: 112 },
  chambre: { x: 100, y: 310, w: 130, h: 242 },
  salon: { x: 230, y: 310, w: 130, h: 242 },
  couloir_int: { x: 100, y: 552, w: 260, h: 80 },
  couloir_ext: { x: 0, y: 632, w: MAP_W, h: 68 },
};

export const SPACE_LABELS: Record<Space, string> = {
  dehors: 'DEHORS',
  balcon: 'BALCON',
  bureau: 'BUREAU',
  chambre: 'CHAMBRE',
  salon: 'SALON',
  sdb: 'SDB',
  couloir_int: 'COULOIR',
  couloir_ext: 'PALIER',
};

/** Zones affichant leur étiquette sur la carte (les autres restent nues). */
export const LABELED_SPACES: Space[] = ['dehors', 'balcon', 'bureau', 'chambre', 'salon'];

/**
 * Point d'ancrage (centre de l'avatar) par personne et par zone : chacun a
 * son emplacement fixe pour que les avatars ne se recouvrent jamais.
 */
export const SLOTS: Record<Space, Record<Person, { x: number; y: number }>> = {
  dehors: {
    greg: { x: 84, y: 162 },
    fiona: { x: 170, y: 158 },
    ubuntu: { x: 252, y: 166 },
  },
  balcon: {
    greg: { x: 70, y: 280 },
    fiona: { x: 176, y: 280 },
    ubuntu: { x: 268, y: 282 },
  },
  bureau: {
    greg: { x: 36, y: 386 },
    fiona: { x: 66, y: 446 },
    ubuntu: { x: 48, y: 494 },
  },
  sdb: {
    greg: { x: 70, y: 556 },
    fiona: { x: 36, y: 592 },
    ubuntu: { x: 68, y: 608 },
  },
  chambre: {
    greg: { x: 136, y: 424 },
    fiona: { x: 196, y: 384 },
    ubuntu: { x: 166, y: 508 },
  },
  salon: {
    greg: { x: 266, y: 424 },
    fiona: { x: 326, y: 384 },
    ubuntu: { x: 294, y: 498 },
  },
  couloir_int: {
    greg: { x: 150, y: 592 },
    fiona: { x: 232, y: 588 },
    ubuntu: { x: 312, y: 594 },
  },
  couloir_ext: {
    greg: { x: 80, y: 666 },
    fiona: { x: 180, y: 662 },
    ubuntu: { x: 276, y: 668 },
  },
};

/** Zone contenant le point (x, y) — coordonnées carte. */
export function spaceAt(x: number, y: number): Space {
  for (const space of Object.keys(ZONES) as Space[]) {
    const r = ZONES[space];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return space;
  }
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
