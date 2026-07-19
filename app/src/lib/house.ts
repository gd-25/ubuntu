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
 *
 * L'appartement est standardisé sur une grille de carrés COL×COL (16 px,
 * la largeur d'une latte de parquet) : 22 colonnes de large au total,
 * soit bureau (6) + chambre (5) + cuisine (5) + salon (6), et des rangées
 * ancrées sur le haut de la maison (y=449). Toutes les frontières de
 * pièces tombent sur la grille :
 *
 *   x=0    x=96    x=176    x=256      x=352
 *   | bureau | chambre | cuisine | salon |     bureau 5 rangées (0-4)
 *   |sdb |coul.|       | wc(4×2)|             sdb+wc dès la rangée 5
 *   x=0  x=64 x=96    x=176   x=240
 *
 *   Balcon : 3 rangées (y=401..449), avancée du salon : 2 (y=417..449).
 *   Chambre : 7 rangées (bas y=561). Sdb : 4 rangées (y=545..609), qui
 *   touche le mur du palier. Bas de l'appartement = rangée 10 (y=609).
 */

/** Côté d'un carré de la grille (largeur d'une latte de parquet). */
export const COL = 16;
/** La carte fait exactement 22 colonnes de large. */
export const GRID_COLS = 22;

export const MAP_W = GRID_COLS * COL; // 352
/** Bas de la carte : palier de 3 cases sous l'appartement (rangées 10-12). */
export const MAP_H = 657;

/** Frontières horizontales des bandes hautes (sur la grille). */
export const OUTSIDE_BOTTOM = 401; // haut du balcon (3 rangées)
export const BALCONY_BOTTOM = 449;
/** Bas de l'appartement (mur avec le palier), rangée 10 de la grille. */
export const FLAT_BOTTOM = 609;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ------------------------------------------------------------ Grille de jeu

/** Haut de la maison = rangée 0 de la grille (le balcon est en rangées -3..-1). */
export const GRID_TOP = 449;

/** Centre de la case (col, rangée) en coordonnées carte. */
export function cellCenter(col: number, row: number): { x: number; y: number } {
  return { x: col * COL + COL / 2, y: GRID_TOP + row * COL + COL / 2 };
}

/**
 * Une case est meublée ou cachée derrière un mur 3D (donc non utilisable).
 * Les faces des murs montent de 1,5 case au-dessus de leur base : la
 * rangée du côté nord entièrement recouverte n'est plus praticable.
 */
function isFurnished(col: number, row: number): boolean {
  // Balcon derrière la façade continue (portes-fenêtres comprises).
  if (row === -1 && col <= 15) return true;
  // Rangée du balcon cachée par le mur haut de l'avancée.
  if (row === -3 && col >= 16) return true;
  if (row === 0 && col <= 2) return true; // table du bureau (3 de large)
  if (row === 5 && col <= 3) return true; // rangée cachée par le mur sdb
  if (row === 6 && col <= 3) return true; // douche (4×1,5 en haut de la sdb)
  if ((row === 8 || row === 9) && col <= 3) return true; // baignoire (rangées 8-9)
  if (col >= 8 && col <= 10 && row === 6) return true; // mur sous le lit (le lit est praticable)
  if (col === 11 && row >= 0 && row <= 6) return true; // colonne cuisine + cuvette WC
  if (col === 12 && row === 5) return true; // débord de la cuvette des WC
  if (row === 4 && col >= 11 && col <= 13) return true; // rangée cachée par le mur wc
  if (row === 6 && col === 12) return true; // derrière le mur prolongé sous le lit
  if (col === 14 && row >= 4 && row <= 6) return true; // table aux plantes
  if (col === 21 && (row === 2 || row === 3)) return true; // meuble à lampe
  if (col >= 17 && col <= 20 && (row === -1 || row === 0)) return true; // table blanche
  if (col >= 17 && col <= 18 && (row === 7 || row === 8)) return true; // table basse
  if (row === 9 && col >= 4 && col <= 11) return true; // bande d'entrée (8 cases dès col 4)
  return false;
}

/**
 * Cases utilisables par les avatars : le balcon (rangées -3..-1, avancée du
 * salon comprise) et tout l'intérieur (rangées 0-9) hors meubles. Le dehors
 * et le palier ne sont pas quadrillés : on y retombe sur l'ancrage de zone.
 */
export const WALKABLE_CELLS: { col: number; row: number; x: number; y: number }[] = [];
for (let row = -3; row <= 9; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    if (isFurnished(col, row)) continue;
    WALKABLE_CELLS.push({ col, row, ...cellCenter(col, row) });
  }
}

/** Index `col,row` → true, pour les worklets (lookup O(1)). */
export const WALKABLE_SET: Record<string, true> = {};
for (const c of WALKABLE_CELLS) WALKABLE_SET[`${c.col},${c.row}`] = true;

/**
 * Rectangles de hit-test, ORDONNÉS : le premier qui contient le point gagne
 * (les petites pièces avant les grandes, l'avancée du salon avant le balcon).
 * Le salon apparaît deux fois : sa partie principale + son avancée sur le
 * balcon. L'union pave toute la carte.
 */
export const ZONE_RECTS: { space: Space; rect: Rect }[] = [
  { space: 'wc', rect: { x: 11 * COL, y: 529, w: 3 * COL, h: 2 * COL } },
  { space: 'sdb', rect: { x: 0, y: 545, w: 4 * COL, h: 4 * COL } },
  { space: 'chambre', rect: { x: 6 * COL, y: 449, w: 5 * COL, h: 7 * COL } },
  // Le bureau descend jusqu'au mur de la sdb (rangée 5 cachée comprise).
  { space: 'bureau', rect: { x: 0, y: 449, w: 6 * COL, h: 6 * COL } },
  // Couloir : cols 4-5 le long de la sdb + sous la chambre (rangées 7-9).
  { space: 'couloir_int', rect: { x: 4 * COL, y: 529, w: 2 * COL, h: 5 * COL } },
  { space: 'couloir_int', rect: { x: 6 * COL, y: 561, w: 5 * COL, h: 3 * COL } },
  // Avancée du salon sur le balcon (avant le balcon dans l'ordre).
  { space: 'salon', rect: { x: 16 * COL, y: 417, w: 6 * COL, h: 2 * COL } },
  { space: 'salon', rect: { x: 11 * COL, y: 449, w: 11 * COL, h: 10 * COL } },
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

/**
 * Point d'ancrage (centre de l'avatar) par personne et par zone : chacun a
 * son emplacement fixe pour que les avatars ne se recouvrent jamais.
 */
export const SLOTS: Record<Space, Record<Person, { x: number; y: number }>> = {
  dehors: {
    greg: { x: 84, y: 319 },
    fiona: { x: 170, y: 315 },
    ubuntu: { x: 250, y: 323 },
  },
  balcon: {
    greg: { x: 60, y: 409 },
    fiona: { x: 148, y: 409 },
    ubuntu: { x: 218, y: 411 },
  },
  bureau: {
    greg: { x: 34, y: 484 },
    fiona: { x: 70, y: 480 },
    ubuntu: { x: 76, y: 514 },
  },
  sdb: {
    greg: { x: 40, y: 566 },
    fiona: { x: 24, y: 572 },
    ubuntu: { x: 56, y: 570 },
  },
  chambre: {
    greg: { x: 124, y: 500 },
    fiona: { x: 156, y: 478 },
    ubuntu: { x: 124, y: 552 },
  },
  salon: {
    greg: { x: 228, y: 504 },
    fiona: { x: 252, y: 470 },
    ubuntu: { x: 296, y: 540 },
  },
  wc: {
    greg: { x: 216, y: 542 },
    fiona: { x: 212, y: 533 },
    ubuntu: { x: 214, y: 553 },
  },
  couloir_int: {
    greg: { x: 92, y: 568 },
    fiona: { x: 134, y: 572 },
    ubuntu: { x: 166, y: 570 },
  },
  couloir_ext: {
    greg: { x: 80, y: 648 },
    fiona: { x: 180, y: 646 },
    ubuntu: { x: 276, y: 650 },
  },
};

/**
 * Le point (x, y) est-il sur le petit tapis gris d'Ubuntu (2×1, juste
 * au-dessus du canapé) ? Chaque arrivée dessus est trackée en activité.
 */
export function isOnUbuntuMat(x: number, y: number): boolean {
  const col = Math.floor(x / COL);
  const row = Math.floor((y - GRID_TOP) / COL);
  return row === 5 && (col === 20 || col === 21);
}

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

/** Un humain a quitté l'appartement (dehors ou sur le palier). */
function isOut(space: Space): boolean {
  return space === 'dehors' || space === 'couloir_ext';
}

/**
 * Type de solitude : `away` (vraiment seul) si les deux humains ont quitté
 * l'appartement (dehors ou palier), `in_home` (semi-seul) s'ils sont dans
 * d'autres pièces.
 */
export function solitudeTypeOf(positions: Positions): SolitudeType {
  if (isOut(positions.greg) && isOut(positions.fiona)) return 'away';
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
