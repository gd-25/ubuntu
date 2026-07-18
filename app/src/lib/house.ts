import type { Person, SolitudeType, Space } from '@/lib/types';

/**
 * Géométrie du plan (repère « carte » en unités fixes, mis à l'échelle à
 * l'écran) et règles de la vie de famille. Fidèle au vrai appartement :
 *
 *   DEHORS   (forêt, sentier en L le long du balcon)
 *   BALCON   (béton) — le salon déborde dessus à droite
 *   BUREAU | CHAMBRE |      SALON
 *   SDB    |      COULOIR / WC / SALON (espace ouvert)
 *   COULOIR EXT (palier, moquette noire)
 */

export const MAP_W = 360;
export const MAP_H = 700;

/** Frontières horizontales des bandes hautes. */
export const OUTSIDE_BOTTOM = 190;
export const BALCONY_BOTTOM = 300;
/** Bas de l'appartement (mur avec le palier). */
export const FLAT_BOTTOM = 640;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Rectangles de hit-test, ORDONNÉS : le premier qui contient le point gagne
 * (les petites pièces avant les grandes, l'avancée du salon avant le balcon).
 * Le salon apparaît deux fois : sa partie principale + son avancée sur le
 * balcon. L'union pave toute la carte.
 */
export const ZONE_RECTS: { space: Space; rect: Rect }[] = [
  { space: 'wc', rect: { x: 196, y: 471, w: 78, h: 64 } },
  { space: 'sdb', rect: { x: 0, y: 471, w: 72, h: 169 } },
  { space: 'chambre', rect: { x: 105, y: 300, w: 91, h: 235 } },
  { space: 'bureau', rect: { x: 0, y: 300, w: 105, h: 229 } },
  { space: 'couloir_int', rect: { x: 72, y: 529, w: 124, h: 111 } },
  // Avancée du salon sur le balcon (avant le balcon dans l'ordre).
  { space: 'salon', rect: { x: 262, y: 214, w: 98, h: 86 } },
  { space: 'salon', rect: { x: 196, y: 300, w: 164, h: 340 } },
  { space: 'balcon', rect: { x: 0, y: OUTSIDE_BOTTOM, w: MAP_W, h: BALCONY_BOTTOM - OUTSIDE_BOTTOM } },
  { space: 'dehors', rect: { x: 0, y: 0, w: MAP_W, h: OUTSIDE_BOTTOM } },
  { space: 'couloir_ext', rect: { x: 0, y: FLAT_BOTTOM, w: MAP_W, h: MAP_H - FLAT_BOTTOM } },
];

export const SPACE_LABELS: Record<Space, string> = {
  dehors: 'DEHORS',
  balcon: 'BALCON',
  bureau: 'BUREAU',
  chambre: 'CHAMBRE',
  salon: 'SALON',
  sdb: 'SDB',
  couloir_int: 'COULOIR',
  couloir_ext: 'PALIER',
  wc: 'WC',
};

/** Étiquettes affichées sur la carte : espace → position (coordonnées carte). */
export const LABEL_POSITIONS: Partial<Record<Space, { x: number; y: number }>> = {
  dehors: { x: 6, y: 28 },
  balcon: { x: 6, y: 210 },
  bureau: { x: 6, y: 308 },
  chambre: { x: 110, y: 308 },
  salon: { x: 202, y: 308 },
};

/**
 * Point d'ancrage (centre de l'avatar) par personne et par zone : chacun a
 * son emplacement fixe pour que les avatars ne se recouvrent jamais.
 */
export const SLOTS: Record<Space, Record<Person, { x: number; y: number }>> = {
  dehors: {
    greg: { x: 84, y: 136 },
    fiona: { x: 170, y: 132 },
    ubuntu: { x: 250, y: 140 },
  },
  balcon: {
    greg: { x: 60, y: 254 },
    fiona: { x: 148, y: 254 },
    ubuntu: { x: 218, y: 258 },
  },
  bureau: {
    greg: { x: 36, y: 368 },
    fiona: { x: 70, y: 416 },
    ubuntu: { x: 48, y: 458 },
  },
  sdb: {
    greg: { x: 36, y: 558 },
    fiona: { x: 38, y: 594 },
    ubuntu: { x: 40, y: 620 },
  },
  chambre: {
    greg: { x: 124, y: 372 },
    fiona: { x: 168, y: 342 },
    ubuntu: { x: 124, y: 482 },
  },
  salon: {
    greg: { x: 240, y: 382 },
    fiona: { x: 300, y: 352 },
    ubuntu: { x: 274, y: 586 },
  },
  wc: {
    greg: { x: 214, y: 496 },
    fiona: { x: 246, y: 512 },
    ubuntu: { x: 218, y: 514 },
  },
  couloir_int: {
    greg: { x: 92, y: 562 },
    fiona: { x: 134, y: 600 },
    ubuntu: { x: 172, y: 564 },
  },
  couloir_ext: {
    greg: { x: 80, y: 668 },
    fiona: { x: 180, y: 664 },
    ubuntu: { x: 276, y: 670 },
  },
};

/** Zone contenant le point (x, y) — coordonnées carte. */
export function spaceAt(x: number, y: number): Space {
  for (const { space, rect } of ZONE_RECTS) {
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) return space;
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
