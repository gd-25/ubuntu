import { memo, type ReactElement } from 'react';
import Svg, { Defs, G, Image as SvgImage, Line, Pattern, Polygon, Rect } from 'react-native-svg';

import { COL, FLAT_BOTTOM, MAP_H, MAP_W, OUTSIDE_BOTTOM } from '@/lib/house';

/**
 * Le plan de l'appartement en pixel-art SVG, standardisé sur une grille de
 * carrés 16×16 (COL = largeur d'une latte de parquet). La carte fait
 * exactement 22 colonnes : bureau (6) + chambre (5) + cuisine (5) + salon (6).
 * Les rangées sont ancrées sur HOUSE_TOP (rangée 0 = haut de la maison) :
 *
 *   Colonnes                          Rangées
 *   cols 0-5   bureau                 balcon rangées -3..-1 (3 cases)
 *   cols 6-10  chambre                avancée salon -2..-1 (2 cases)
 *   cols 11-15 cuisine (esp. salon)   bureau 0-4 (5, armoire 4×1 rangée 4)
 *   cols 16-21 salon + avancée        couloir bureau 4-5 (2 cases)
 *   cols 0-3   salle de bain          chambre 0-6 (7 cases)
 *   cols 4-5   couloir du bureau      sdb rangées 6-9 (4), wc rangées 5-6
 *   cols 11-14 WC (4×2)               bas de l'appartement = rangée 10
 */

// Grille : rangée 0 en haut de la maison, colonnes depuis le bord gauche.
const HOUSE_TOP = 449;
const CX = (c: number) => c * COL;
const RY = (r: number) => HOUSE_TOP + r * COL;

// Repères verticaux (tous sur la grille).
const WET_TOP = RY(5); // 529 — haut des WC
const SDB_TOP = RY(6); // 545 — haut de la salle de bain (1 rangée de moins)
const SDB_BOT = RY(10); // 609 — bas de la sdb = bas de l'appartement
const CHAMBRE_BOT = RY(7); // 561 — bas de la chambre et des WC
const EXT_TOP = RY(-2); // 417 — avancée du salon : 2 cases sur le balcon

// Frontières verticales de colonnes.
const CHAMBRE_L = CX(6); // 96 — bureau | chambre
const CUISINE_L = CX(11); // 176 — chambre | cuisine/salon
const SALON_L = CX(16); // 256 — cuisine | salon, et bord gauche de l'avancée
const SDB_R = CX(4); // 64 — sdb | couloir du bureau
const WC_R = CX(14); // 224 — bord droit des WC (3 cases de long)
const LIT_L = CX(8); // 128 — espace libre (2 cols) | lit (3 cols)

interface Palette {
  grass: string;
  grassLight: string;
  treeDark: string;
  tree: string;
  treeLight: string;
  trunk: string;
  path: string;
  pathEdge: string;
  concrete: string;
  concreteLine: string;
  railing: string;
  wall: string;
  parquet: string;
  parquetLine: string;
  bureauFloor: string;
  carpet: string;
  carpetLine: string;
  doormat: string;
  tile: string;
  tileAlt: string;
  merisier: string;
  merisierDark: string;
  merisierLight: string;
  outline: string;
  woodLight: string;
  fence: string;
  slate: string;
  stone: string;
  wallFace: string;
  wallFaceLight: string;
  beigeRug: string;
  beigeRugEdge: string;
  greyRug: string;
  greyRugEdge: string;
  sofaLight: string;
  tub: string;
  water: string;
  porcelain: string;
  wood: string;
  screen: string;
  mattress: string;
  pillow: string;
  blanket: string;
  sofa: string;
  sofaDark: string;
  window: string;
  flower1: string;
  flower2: string;
}

const DAY: Palette = {
  grass: '#78C050',
  grassLight: '#86CC5E',
  treeDark: '#2E6828',
  tree: '#3E8834',
  treeLight: '#54A448',
  trunk: '#7A4A28',
  path: '#D8B078',
  pathEdge: '#BC9258',
  concrete: '#C2C2C6',
  concreteLine: '#A9A9AE',
  railing: '#7E7E88',
  wall: '#3F3F46',
  parquet: '#D8C098',
  parquetLine: '#C2A878',
  bureauFloor: '#B8AC9C',
  carpet: '#2E2E36',
  carpetLine: '#3A3A44',
  doormat: '#8A6030',
  tile: '#CFE8EC',
  tileAlt: '#BEDDE2',
  merisier: '#9C5A38',
  merisierDark: '#7E4628',
  merisierLight: '#B4744A',
  outline: '#2E2E38',
  woodLight: '#96603A',
  fence: '#93382F',
  slate: '#63636D',
  stone: '#F2F2EE',
  wallFace: '#E8E8E2',
  wallFaceLight: '#F8F8F4',
  beigeRug: '#B49A6A',
  beigeRugEdge: '#D0BC90',
  greyRug: '#A8A8B0',
  greyRugEdge: '#8E8E98',
  sofaLight: '#C6C6CC',
  tub: '#F4F4F0',
  water: '#7EC8E0',
  porcelain: '#FFFFFF',
  wood: '#7A4A28',
  screen: '#2870C0',
  mattress: '#F0ECE0',
  pillow: '#FFFFFF',
  blanket: '#4870B8',
  sofa: '#4870B8',
  sofaDark: '#38548C',
  window: '#A8D8E8',
  flower1: '#E8E060',
  flower2: '#E88088',
};

const NIGHT: Palette = {
  grass: '#38583A',
  grassLight: '#406442',
  treeDark: '#1C3820',
  tree: '#264C2A',
  treeLight: '#325C36',
  trunk: '#4A3020',
  path: '#8A7450',
  pathEdge: '#6E5A40',
  concrete: '#60606A',
  concreteLine: '#50505A',
  railing: '#3C3C46',
  wall: '#26262C',
  parquet: '#6E5C42',
  parquetLine: '#5E4C36',
  bureauFloor: '#5E5850',
  carpet: '#212129',
  carpetLine: '#2B2B35',
  doormat: '#5E401E',
  tile: '#5E7880',
  tileAlt: '#526A72',
  merisier: '#5E3622',
  merisierDark: '#48291A',
  merisierLight: '#6E4630',
  outline: '#14141C',
  woodLight: '#553520',
  fence: '#57221C',
  slate: '#33333B',
  stone: '#AAAAA4',
  wallFace: '#8E8E8A',
  wallFaceLight: '#A2A29E',
  beigeRug: '#5A4E36',
  beigeRugEdge: '#6A5C40',
  greyRug: '#55555E',
  greyRugEdge: '#46464E',
  sofaLight: '#6E6E78',
  tub: '#B8BCB4',
  water: '#4E90A8',
  porcelain: '#D8D8D0',
  wood: '#4A3020',
  screen: '#88C8F0',
  mattress: '#B8B4A8',
  pillow: '#D8D8D0',
  blanket: '#32508A',
  sofa: '#324E80',
  sofaDark: '#263A60',
  window: '#F0D878',
  flower1: '#A8A050',
  flower2: '#986068',
};

function Tree({ x, y, p }: { x: number; y: number; p: Palette }) {
  return (
    <G>
      <Rect x={x + 10} y={y + 30} width={8} height={10} fill={p.trunk} />
      <Rect x={x} y={y + 18} width={28} height={14} fill={p.treeDark} />
      <Rect x={x + 2} y={y + 8} width={24} height={12} fill={p.tree} />
      <Rect x={x + 6} y={y} width={16} height={10} fill={p.treeLight} />
    </G>
  );
}

function Flower({ x, y, color }: { x: number; y: number; color: string }) {
  return <Rect x={x} y={y} width={5} height={5} fill={color} />;
}

/** Hauteur des faces de murs : 1 case et demie. */
const WALL_H = COL + COL / 2; // 24

/** Cloison vue de dessus : trait blanc (par défaut, la largeur d'une strie). */
function WallV({
  x,
  y,
  h,
  p,
  w = 1.5,
}: {
  x: number;
  y: number;
  h: number;
  p: Palette;
  w?: number;
}) {
  return <Rect x={x} y={y} width={w} height={h} fill={p.wallFace} />;
}

/**
 * Porte-fenêtre vitrée : UNE porte de 1,4 case de large et 1,2 de haut,
 * posée au sol (il reste un peu de mur blanc au-dessus). Utilisée pour la
 * chambre et la cuisine.
 */
function GlassDoor({ x, base, p }: { x: number; base: number; p: Palette }) {
  return (
    <G>
      <Rect x={x} y={base - 19} width={22} height={19} fill={p.outline} />
      <Rect x={x + 1} y={base - 18} width={20} height={17} fill={p.window} />
      <Rect x={x + 3} y={base - 15} width={7} height={4} fill={p.porcelain} />
      <Rect x={x + 17} y={base - 10} width={2} height={4} fill={p.railing} />
    </G>
  );
}

/**
 * Face visible d'un mur horizontal (relief 3D façon Pokémon) : le mur
 * blanc monte de 1,5 case AU-DESSUS de sa ligne de base (`base` = là où il
 * touche le sol de la pièce au sud) et cache ce qui est derrière. Chapeau
 * sombre en haut, liseré éclairé, ligne sombre au ras du sol.
 */
function WallFace({ x, base, w, p }: { x: number; base: number; w: number; p: Palette }) {
  return (
    <G>
      <Rect x={x} y={base - WALL_H} width={w} height={WALL_H} fill={p.wallFace} />
      <Rect x={x} y={base - WALL_H} width={w} height={3} fill={p.wallFaceLight} />
    </G>
  );
}

/**
 * Sprite dessiné pixel par pixel : chaque caractère de la grille est un
 * pixel d'une unité carte ('.' = transparent). Permet de recréer fidèlement
 * les meubles détaillés façon Game Boy Advance.
 */
function PixelSprite({
  x,
  y,
  grid,
  colors,
  scale = 1,
}: {
  x: number;
  y: number;
  grid: string[];
  colors: Record<string, string>;
  scale?: number;
}) {
  const px: ReactElement[] = [];
  grid.forEach((row, j) => {
    // Fusionne les pixels contigus de même couleur en une seule plage
    // (évite les liserés d'anti-aliasing entre petits rects).
    let start = -1;
    for (let i = 0; i <= row.length; i++) {
      const c = i < row.length ? row[i] : '.';
      if (start >= 0 && (c === '.' || c !== row[start])) {
        px.push(
          <Rect
            key={`${start}-${j}`}
            x={x + start * scale}
            y={y + j * scale}
            width={(i - start) * scale}
            height={scale + 0.12}
            fill={colors[row[start]]}
          />
        );
        start = -1;
      }
      if (start < 0 && c !== '.') start = i;
    }
  });
  return <G>{px}</G>;
}

/**
 * Le PC vintage du bureau, répliqué du sprite de la chambre du joueur en
 * Gen 3 : gros moniteur crème à écran sombre, unité à fente disquette.
 * (Il se pose sur la table du bureau, dessinée à part.)
 */
/**
 * Douche détaillée (32×12, échelle 2 → 4×1,5 cases) : receveur à rebord
 * blanc, fond carrelé, colonne et pomme chromées, bonde, gouttes d'eau.
 */
/**
 * Sol de la douche en opus incertum : pierres polygonales irrégulières
 * (points relatifs au coin haut-gauche du sol) sur fond de joints clairs.
 * `c` indexe le ton de pierre dans le composant.
 */
const SHOWER_STONES: { pts: number[][]; c: number }[] = [
  // Rangée du fond : petites pierres (loin)
  { pts: [[0, 0], [6, 0], [5, 5], [0, 6]], c: 0 },
  { pts: [[8, 0], [14, 0], [13, 5], [7, 6]], c: 1 },
  { pts: [[16, 0], [21, 0], [22, 6], [15, 6]], c: 2 },
  { pts: [[23, 0], [29, 0], [28, 5], [24, 6]], c: 0 },
  { pts: [[31, 0], [37, 0], [36, 6], [30, 6]], c: 1 },
  { pts: [[39, 0], [44, 0], [45, 5], [38, 6]], c: 3 },
  { pts: [[46, 0], [52, 0], [51, 6], [47, 6]], c: 0 },
  { pts: [[54, 0], [59, 0], [60, 5], [53, 6]], c: 2 },
  { pts: [[61, 0], [64, 0], [64, 6], [62, 6]], c: 1 },
  // Rangée du milieu : pierres moyennes
  { pts: [[0, 8], [8, 7], [9, 13], [0, 14]], c: 1 },
  { pts: [[11, 7], [20, 8], [19, 14], [10, 14]], c: 3 },
  { pts: [[22, 8], [31, 7], [32, 13], [21, 14]], c: 0 },
  { pts: [[33, 7], [42, 8], [43, 14], [34, 14]], c: 2 },
  { pts: [[45, 8], [53, 7], [54, 13], [44, 14]], c: 1 },
  { pts: [[56, 7], [64, 8], [64, 14], [55, 14]], c: 0 },
  // Rangée de devant : grandes pierres (près)
  { pts: [[0, 16], [13, 15], [12, 24], [0, 24]], c: 2 },
  { pts: [[15, 15], [29, 16], [30, 24], [14, 24]], c: 0 },
  { pts: [[31, 16], [46, 15], [45, 24], [32, 24]], c: 1 },
  { pts: [[48, 15], [64, 16], [64, 24], [47, 24]], c: 3 },
];

/** Bouquet de tulipes roses : deux fleurs à reflet, tiges et feuilles,
 * pot en terre cuite à rebord. */
const FLOWERS_PINK_GRID = [
  '.KKK....KKK.',
  'KPPPK..KPPPK',
  'KPWPK..KPWPK',
  'KPPPK..KPPPK',
  '.KKKG..GKKK.',
  '..KGKggKGK..',
  '..gKGKKGKg..',
  '...KGGGGK...',
  '..KKKKKKKK..',
  '..KRRRRRRK..',
  '..KrrrrrrK..',
  '...KrrrrK...',
  '....KKKK....',
];

/** Marguerites blanches à cœur jaune, tiges feuillues, pot céramique. */
const FLOWERS_WHITE_GRID = [
  '..KKK...KKK.',
  '.KWWWK.KWWWK',
  '.KWYWK.KWYWK',
  '.KWWWK.KWWWK',
  '..KKK...KKK.',
  '...KG...GK..',
  '..ggKG.KGgg.',
  '...KGGGGGK..',
  '..KKKKKKKK..',
  '..KRRRRRRK..',
  '..KrrrrrrK..',
  '...KrrrrK...',
  '....KKKK....',
];

/** Plante en pot détaillée : feuillage à deux verts, pot en terre cuite. */
const PLANT_GRID = [
  '...KK.KK...',
  '..KGGKGGK..',
  '.KGgGGGgGK.',
  '.KGGgGgGGK.',
  '..KGGGGGK..',
  '...KKKKK...',
  '..KRRRRRK..',
  '..KrrrrrK..',
  '...KrrrK...',
  '....KKK....',
];

const PC_GRID = [
  '....KKKKKKKKKK....',
  '..KKWWWWWWWWWWKK..',
  '..KWWWWWWWWWWWWK..',
  '..KWKKKKKKKKKKWK..',
  '..KWKBBBBBBBBKWK..',
  '..KWKBLLBBBBBKWK..',
  '..KWKBLBBBBBBKWK..',
  '..KWKBBBBBBBBKWK..',
  '..KWKKKKKKKKKKWK..',
  '..KWWWWWWWWWWWWK..',
  '..KSWWWWWWWWWWSK..',
  '...KKKKKKKKKKKK...',
  '..KWWWWWWWWWWWWK..',
  '..KWSDDDDDDDDSWK..',
  '..KWWWWWWWWWWWWK..',
  '..KKKKKKKKKKKKKK..',
];

/**
 * Damier de carreaux 16×16 aligné sur la grille globale (colonnes en x,
 * rangées ancrées sur HOUSE_TOP en y), rogné aux bords de la pièce.
 */
function CheckerTiles({
  x0,
  x1,
  y0,
  y1,
  fill,
}: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  fill: string;
}) {
  const cells: ReactElement[] = [];
  const firstRow = Math.floor((y0 - HOUSE_TOP) / COL);
  const lastRow = Math.ceil((y1 - HOUSE_TOP) / COL);
  for (let c = x0 / COL; c < x1 / COL; c++) {
    for (let r = firstRow; r < lastRow; r++) {
      if ((c + r) % 2 !== 0) continue;
      const top = Math.max(y0, HOUSE_TOP + r * COL);
      const bot = Math.min(y1, HOUSE_TOP + (r + 1) * COL);
      if (bot <= top) continue;
      cells.push(
        <Rect key={`${c}-${r}`} x={c * COL} y={top} width={COL} height={bot - top} fill={fill} />
      );
    }
  }
  return <G>{cells}</G>;
}

/** Sentier en L : sortie de l'immeuble à droite, puis parallèle au balcon. */
const TRAIL_Y = 309;
const TRAIL_H = 30;
const TRAIL_STUB_X = 288;
const TRAIL_STUB_W = 30;

export const HouseMap = memo(function HouseMap({ night }: { night: boolean }) {
  const p = night ? NIGHT : DAY;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
      {/* ---------------- Dehors : grande forêt + sentier en L ---------------- */}
      <Rect x={0} y={0} width={MAP_W} height={OUTSIDE_BOTTOM} fill={p.grass} />
      {Array.from({ length: 9 }).map((_, col) =>
        Array.from({ length: 11 }).map((_, row) =>
          (col + row) % 2 === 0 ? (
            <Rect
              key={`g${col}-${row}`}
              x={col * 40}
              y={row * 40}
              width={Math.min(40, MAP_W - col * 40)}
              height={Math.min(40, OUTSIDE_BOTTOM - row * 40)}
              fill={p.grassLight}
            />
          ) : null
        )
      )}
      {/* Branche horizontale du sentier : bord à bord */}
      <Rect x={0} y={TRAIL_Y} width={TRAIL_STUB_X + TRAIL_STUB_W} height={TRAIL_H} fill={p.path} />
      <Rect x={0} y={TRAIL_Y} width={TRAIL_STUB_X + TRAIL_STUB_W} height={3} fill={p.pathEdge} />
      <Rect x={0} y={TRAIL_Y + TRAIL_H - 3} width={TRAIL_STUB_X} height={3} fill={p.pathEdge} />
      {/* Branche verticale : sortie de l'immeuble, à droite */}
      <Rect x={TRAIL_STUB_X} y={TRAIL_Y + 3} width={TRAIL_STUB_W} height={OUTSIDE_BOTTOM - TRAIL_Y - 3} fill={p.path} />
      <Rect x={TRAIL_STUB_X} y={TRAIL_Y + TRAIL_H} width={3} height={OUTSIDE_BOTTOM - TRAIL_Y - TRAIL_H} fill={p.pathEdge} />
      <Rect x={TRAIL_STUB_X + TRAIL_STUB_W - 3} y={TRAIL_Y + 3} width={3} height={OUTSIDE_BOTTOM - TRAIL_Y - 3} fill={p.pathEdge} />
      {/* Une rangée d'arbres au-dessus du sentier, une en dessous — que de
          l'herbe au-dessus */}
      <Tree x={4} y={265} p={p} />
      <Tree x={64} y={265} p={p} />
      <Tree x={124} y={265} p={p} />
      <Tree x={184} y={265} p={p} />
      <Tree x={244} y={265} p={p} />
      <Tree x={306} y={265} p={p} />
      <Tree x={4} y={341} p={p} />
      <Tree x={64} y={341} p={p} />
      <Tree x={124} y={341} p={p} />
      <Tree x={184} y={341} p={p} />
      <Tree x={244} y={341} p={p} />
      <Tree x={320} y={341} p={p} />
      {/* Fleurs */}
      <Flower x={60} y={80} color={p.flower1} />
      <Flower x={170} y={140} color={p.flower2} />
      <Flower x={280} y={70} color={p.flower1} />
      <Flower x={110} y={200} color={p.flower2} />
      <Flower x={230} y={190} color={p.flower1} />
      <Flower x={320} y={150} color={p.flower2} />
      <Flower x={30} y={160} color={p.flower2} />

      {/* ---------------- Balcon (béton, 3 rangées de cases) ---------------- */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={MAP_W} height={HOUSE_TOP - OUTSIDE_BOTTOM} fill={p.concrete} />
      {/* Dalles alignées sur la grille (2 colonnes de large) */}
      {[-2, -1].map((r) => (
        <Line
          key={`cj${r}`}
          x1={0}
          y1={RY(r)}
          x2={MAP_W}
          y2={RY(r)}
          stroke={p.concreteLine}
          strokeWidth={2}
        />
      ))}
      {Array.from({ length: 21 }).map((_, i) => (
        <Line
          key={`cv${i}`}
          x1={(i + 1) * COL}
          y1={OUTSIDE_BOTTOM}
          x2={(i + 1) * COL}
          y2={HOUSE_TOP}
          stroke={p.concreteLine}
          strokeWidth={2}
        />
      ))}
      {/* Rambarde rouge foncé d'une case de haut : main courante + barreaux
          serrés */}
      <Rect x={0} y={OUTSIDE_BOTTOM - COL} width={MAP_W} height={1.5} fill={p.fence} />
      {Array.from({ length: 88 }).map((_, i) => (
        <Rect
          key={`fb${i}`}
          x={i * 4}
          y={OUTSIDE_BOTTOM - COL + 1.5}
          width={1}
          height={COL - 3}
          fill={p.fence}
        />
      ))}
      <Rect x={MAP_W - 1} y={OUTSIDE_BOTTOM - COL + 1.5} width={1} height={COL - 3} fill={p.fence} />
      <Rect x={0} y={OUTSIDE_BOTTOM - 1.5} width={MAP_W} height={1.5} fill={p.fence} />

      {/* ---------------- Sols ---------------- */}
      {/* Parquet commun : tout l'appartement (bureau compris) + avancée */}
      <Rect x={0} y={HOUSE_TOP} width={MAP_W} height={FLAT_BOTTOM - HOUSE_TOP} fill={p.parquet} />
      <Rect x={SALON_L} y={EXT_TOP} width={MAP_W - SALON_L} height={HOUSE_TOP - EXT_TOP} fill={p.parquet} />
      {/* Salle de bain + WC : carrelage en damier 16×16 aligné sur la grille */}
      <Rect x={0} y={SDB_TOP} width={SDB_R} height={SDB_BOT - SDB_TOP} fill={p.tile} />
      <CheckerTiles x0={0} x1={SDB_R} y0={SDB_TOP} y1={SDB_BOT} fill={p.tileAlt} />
      <Rect x={CUISINE_L} y={WET_TOP} width={WC_R - CUISINE_L} height={CHAMBRE_BOT - WET_TOP} fill={p.tile} />
      <CheckerTiles x0={CUISINE_L} x1={WC_R} y0={WET_TOP} y1={CHAMBRE_BOT} fill={p.tileAlt} />
      {/* Palier (moquette noire) */}
      <Rect x={0} y={FLAT_BOTTOM} width={MAP_W} height={MAP_H - FLAT_BOTTOM} fill={p.carpet} />

      {/* ---------------- Lattes du parquet (une par colonne) ----------------
          Dessinées avant les tapis (qui les recouvrent) et interrompues sur
          le carrelage de la sdb et des wc. */}
      {Array.from({ length: 21 }).map((_, i) => {
        const x = (i + 1) * COL;
        const top = x >= SALON_L ? EXT_TOP : HOUSE_TOP;
        const segments: [number, number][] =
          x <= SDB_R
            ? [[top, WET_TOP]]
            : x >= CUISINE_L && x < WC_R
              ? [
                  [top, WET_TOP],
                  [CHAMBRE_BOT, FLAT_BOTTOM],
                ]
              : [[top, FLAT_BOTTOM]];
        return segments.map(([y1, y2], j) => (
          <Line
            key={`gc${i}-${j}`}
            x1={x}
            y1={y1}
            x2={x}
            y2={y2}
            stroke={p.parquetLine}
            strokeWidth={1.5}
          />
        ));
      })}

      {/* ---------------- Tapis ---------------- */}
      {/* Salon : tapis beige 5×6, bordure + damier tissé ultra-fin (2 px) */}
      <Defs>
        <Pattern
          id="rugCheck"
          x={CX(17) + 3}
          y={RY(4) + 3}
          width={4}
          height={4}
          patternUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={4} height={4} fill={p.beigeRug} />
          <Rect x={0} y={0} width={2} height={2} fill={p.beigeRugEdge} />
          <Rect x={2} y={2} width={2} height={2} fill={p.beigeRugEdge} />
        </Pattern>
      </Defs>
      <Rect x={CX(17)} y={RY(4)} width={5 * COL} height={6 * COL} fill={p.beigeRug} />
      <Rect
        x={CX(17) + 1.5}
        y={RY(4) + 1.5}
        width={5 * COL - 3}
        height={6 * COL - 3}
        fill="url(#rugCheck)"
      />
      {/* Le petit tapis gris d'Ubuntu est un composant à part (UbuntuMat) :
          il se déplace sur le plan pendant les sessions Overall */}

      {/* Bureau : tapis gris foncé uni 3×3, sans bordure ni motif */}
      <Rect x={0} y={RY(0)} width={3 * COL} height={3 * COL} fill={p.greyRugEdge} />

      {/* ------------- Faces des murs (2 cases, au-dessus de la base) ------- */}
      {/* Façade côté balcon : mur blanc continu, percé d'une porte-fenêtre
          pour la chambre et une pour la cuisine (même composant) */}
      <WallFace x={0} base={HOUSE_TOP} w={SALON_L} p={p} />
      <GlassDoor x={101} base={HOUSE_TOP} p={p} />
      <GlassDoor x={213} base={HOUSE_TOP} p={p} />
      {/* Bureau : deux grandes fenêtres collées (une seule paire de
          bordures, jonction centrale), centrées sur la moitié haute */}
      <Rect x={CX(1)} y={HOUSE_TOP - 21} width={4 * COL} height={12} fill={p.outline} />
      <Rect x={CX(1) + 1} y={HOUSE_TOP - 20} width={4 * COL - 2} height={10} fill={p.window} />
      <Rect x={CX(1) + 31} y={HOUSE_TOP - 20} width={2} height={10} fill={p.outline} />
      <Rect x={CX(1) + 4} y={HOUSE_TOP - 18} width={9} height={3} fill={p.porcelain} />
      <Rect x={CX(1) + 36} y={HOUSE_TOP - 18} width={9} height={3} fill={p.porcelain} />
      {/* Mur blanc du fond de l'avancée : trois portes-fenêtres collées,
          alignées à gauche */}
      <WallFace x={SALON_L} base={EXT_TOP} w={MAP_W - SALON_L} p={p} />
      {/* Retour de mur sur le flanc gauche de l'avancée : trait blanc de 3,
          centré sur la frontière, du haut du mur jusqu'à la façade */}
      <WallV
        x={SALON_L - 1.5}
        y={EXT_TOP - WALL_H}
        h={HOUSE_TOP - EXT_TOP + WALL_H}
        w={3}
        p={p}
      />
      <GlassDoor x={271} base={EXT_TOP} p={p} />
      <GlassDoor x={293} base={EXT_TOP} p={p} />
      <GlassDoor x={315} base={EXT_TOP} p={p} />

      {/* ---------------- Meubles (pixel-art 3D, contours sombres) --------- */}
      {/* Bureau : table blanche 3 cases de large, pieds métal
          (le PC est dessiné après les murs, il les chevauche) */}
      <Rect x={0} y={RY(0)} width={3 * COL} height={14} rx={2} fill={p.outline} />
      <Rect x={1} y={RY(0) + 1} width={3 * COL - 2} height={8} fill={p.porcelain} />
      <Rect x={1} y={RY(0) + 9} width={3 * COL - 2} height={4} fill={p.sofaLight} />
      {[3, 39].map((lx) => (
        <G key={`dl${lx}`}>
          <Rect x={lx} y={RY(0) + 13} width={5} height={7} rx={1} fill={p.outline} />
          <Rect x={lx + 1} y={RY(0) + 13} width={3} height={6} fill={p.greyRugEdge} />
        </G>
      ))}

      {/* (Plus d'armoire dans le bureau : parquet nu devant le mur de la sdb) */}

      {/* Douche : juste le sol 4×1,5 en opus incertum (pierres + joints),
          cerné d'un cadre argenté très fin */}
      <Rect x={0} y={SDB_TOP} width={4 * COL} height={24} fill={p.sofaLight} />
      {SHOWER_STONES.map(({ pts, c }, i) => (
        <Polygon
          key={`st${i}`}
          points={pts.map(([sx, sy]) => `${sx},${SDB_TOP + sy}`).join(' ')}
          fill={p.stone}
        />
      ))}

      {/* Baignoire : le sprite pixel-art fourni, affiché tel quel */}
      <SvgImage
        x={1}
        y={FLAT_BOTTOM - 31}
        width={62}
        height={30}
        preserveAspectRatio="xMidYMid meet"
        href={require('../../assets/images/bathtub.png')}
      />

      {/* Lit 3×4 (rangées 2-5) : le sprite pixel-art fourni, tel quel —
          le mur du bas le masque de 0,5 case */}
      <SvgImage
        x={LIT_L}
        y={RY(6) - 61}
        width={48}
        height={61}
        preserveAspectRatio="xMidYMid meet"
        href={require('../../assets/images/bed.png')}
      />

      {/* WC : dessinés après les murs (voir « Meubles hauts ») */}

      {/* Meuble bois 1×2 au-dessus du canapé, juste hors du tapis, avec une
          grande lampe ronde blanche (même bois que la table basse) */}
      <Rect x={CX(21)} y={RY(2)} width={COL} height={2 * COL} rx={3} fill={p.outline} />
      <Rect x={CX(21) + 1} y={RY(2) + 1} width={COL - 2} height={2 * COL - 6} rx={2} fill={p.woodLight} />
      <Rect x={CX(21) + 1} y={RY(2) + 27} width={COL - 2} height={4} rx={1} fill={p.wood} />
      <Rect x={CX(21) + 3} y={RY(2) + 3} width={COL - 6} height={2} fill={p.merisierLight} />

      {/* Canapé agrandi (3 places, rangées 5,5-9) : bords fins façon tables,
          dossier contre le mur, accoudoirs, deux coutures (trois assises),
          face avant ombrée et pieds */}
      <Rect x={CX(20) + 2} y={RY(6) + 52} width={5} height={6} rx={1} fill={p.outline} />
      <Rect x={CX(20) + 25} y={RY(6) + 52} width={5} height={6} rx={1} fill={p.outline} />
      <Rect x={CX(20) - 2} y={RY(6) - 8} width={2 * COL + 2} height={62} rx={4} fill={p.outline} />
      <Rect x={CX(20) - 1} y={RY(6) - 7} width={2 * COL} height={60} rx={3} fill={p.sofaLight} />
      <Rect x={CX(20) + 22} y={RY(6) - 6} width={10} height={54} rx={3} fill={p.greyRug} />
      <Rect x={CX(20) + 26} y={RY(6) - 4} width={2} height={50} fill={p.sofaLight} />
      <Rect x={CX(20) - 1} y={RY(6) - 7} width={24} height={8} rx={3} fill={p.greyRug} />
      <Rect x={CX(20) - 1} y={RY(6) + 40} width={24} height={8} rx={3} fill={p.greyRug} />
      <Rect x={CX(20) + 1} y={RY(6) + 14} width={21} height={2} fill={p.greyRugEdge} />
      <Rect x={CX(20) + 1} y={RY(6) + 27} width={21} height={2} fill={p.greyRugEdge} />
      <Rect x={CX(20) - 1} y={RY(6) + 48} width={2 * COL} height={5} rx={1} fill={p.greyRugEdge} />

      {/* Table basse 2×2 : plateau bois sur pieds (3D) */}
      <Rect x={CX(17) + 2} y={RY(7) + 24} width={5} height={7} rx={1} fill={p.outline} />
      <Rect x={CX(17) + 25} y={RY(7) + 24} width={5} height={7} rx={1} fill={p.outline} />
      <Rect x={CX(17) + 3} y={RY(7) + 25} width={3} height={5} fill={p.wood} />
      <Rect x={CX(17) + 26} y={RY(7) + 25} width={3} height={5} fill={p.wood} />
      <Rect x={CX(17)} y={RY(7)} width={2 * COL} height={26} rx={3} fill={p.outline} />
      <Rect x={CX(17) + 1} y={RY(7) + 1} width={30} height={19} rx={2} fill={p.woodLight} />
      <Rect x={CX(17) + 1} y={RY(7) + 20} width={30} height={5} rx={1} fill={p.wood} />
      <Rect x={CX(17) + 3} y={RY(7) + 3} width={26} height={2} fill={p.merisierLight} />

      {/* Cuisine : plan de travail blanc uni à bordure grise, avec la
          plaque à induction — carré gris clair à 4 anneaux */}
      <Rect x={CUISINE_L} y={RY(0)} width={COL} height={4 * COL} rx={2} fill={p.greyRugEdge} />
      <Rect x={CUISINE_L + 1} y={RY(0) + 1} width={COL - 2} height={4 * COL - 2} rx={2} fill={p.porcelain} />
      <Rect x={CUISINE_L + 3.5} y={RY(1) + 6} width={9} height={9} rx={1} fill={p.sofaLight} />
      {[
        [1.5, 1.5],
        [5, 1.5],
        [1.5, 5],
        [5, 5],
      ].map(([dx, dy]) => (
        <Rect
          key={`feu${dx}-${dy}`}
          x={CUISINE_L + 3.5 + dx}
          y={RY(1) + 6 + dy}
          width={2.5}
          height={2.5}
          rx={1.25}
          fill="none"
          stroke={p.greyRugEdge}
          strokeWidth={0.8}
        />
      ))}

      {/* Grande table blanche 4×2 : plateau arrondi, pieds, plante en pot */}
      <Rect x={CX(17) + 2} y={RY(-1) + 24} width={5} height={7} rx={1} fill={p.outline} />
      <Rect x={CX(17) + 57} y={RY(-1) + 24} width={5} height={7} rx={1} fill={p.outline} />
      <Rect x={CX(17) + 3} y={RY(-1) + 24} width={3} height={6} fill={p.greyRugEdge} />
      <Rect x={CX(17) + 58} y={RY(-1) + 24} width={3} height={6} fill={p.greyRugEdge} />
      <Rect x={CX(17)} y={RY(-1)} width={4 * COL} height={26} rx={4} fill={p.outline} />
      <Rect x={CX(17) + 1} y={RY(-1) + 1} width={62} height={20} rx={3} fill={p.tub} />
      <Rect x={CX(17) + 1} y={RY(-1) + 21} width={62} height={4} rx={2} fill={p.sofaLight} />
      <PixelSprite
        x={CX(17) + 27}
        y={RY(-1) + 4}
        grid={PLANT_GRID}
        colors={{
          K: p.outline,
          G: p.treeLight,
          g: p.tree,
          R: p.merisierLight,
          r: p.merisier,
        }}
      />

      {/* Faces dessinées APRÈS les meubles qu'elles masquent de 0,5 case :
          murs blancs de la sdb et des wc (sur l'armoire, le meuble cuisine
          et le bas de la colonne), mur bas de la chambre (sur le lit) */}
      {/* Mur de la douche : ardoise pleine, épais liseré blanc en haut */}
      <Rect x={0} y={SDB_TOP - WALL_H} width={SDB_R} height={WALL_H} fill={p.slate} />
      <Rect x={0} y={SDB_TOP - WALL_H} width={SDB_R} height={3} fill={p.wallFace} />
      <WallFace x={CUISINE_L} base={WET_TOP} w={WC_R - CUISINE_L} p={p} />
      {/* Bord droit des WC : trait de 3 le long de la pièce et du mur blanc */}
      <WallV x={WC_R - 1.5} y={WET_TOP - WALL_H} h={WALL_H + CHAMBRE_BOT - WET_TOP} w={3} p={p} />
      {/* Table blanche 1×3 contre le mur des WC, trois plantes différentes */}
      <Rect x={WC_R} y={RY(4)} width={COL} height={3 * COL - 2} rx={3} fill={p.outline} />
      <Rect x={WC_R + 1} y={RY(4) + 1} width={COL - 2} height={3 * COL - 8} rx={2} fill={p.tub} />
      <Rect x={WC_R + 1} y={RY(4) + 41} width={COL - 2} height={4} rx={1} fill={p.sofaLight} />
      <Rect x={WC_R + 3} y={RY(7) - 3} width={2} height={5} rx={1} fill={p.greyRugEdge} />
      <Rect x={WC_R + 11} y={RY(7) - 3} width={2} height={5} rx={1} fill={p.greyRugEdge} />
      {/* 1. plante en pot touffue */}
      <PixelSprite
        x={WC_R + 2}
        y={RY(4) + 3}
        grid={PLANT_GRID}
        colors={{
          K: p.outline,
          G: p.treeLight,
          g: p.tree,
          R: p.merisierLight,
          r: p.merisier,
        }}
      />
      {/* 2. bouquet de tulipes roses (chevauche le pot de la plante du haut) */}
      <PixelSprite
        x={WC_R + 2}
        y={RY(5) - 6}
        grid={FLOWERS_PINK_GRID}
        colors={{
          K: p.outline,
          P: p.flower2,
          W: p.porcelain,
          G: p.tree,
          g: p.treeLight,
          R: p.merisierLight,
          r: p.merisier,
        }}
      />
      {/* 3. marguerites blanches à cœur jaune */}
      <PixelSprite
        x={WC_R + 2}
        y={RY(6) - 8}
        grid={FLOWERS_WHITE_GRID}
        colors={{
          K: p.outline,
          W: p.porcelain,
          Y: p.flower1,
          G: p.tree,
          g: p.treeLight,
          R: p.sofaLight,
          r: p.greyRug,
        }}
      />
      {/* WC : adossés au mur du haut, réhaussés d'une case — le mur prolongé
          dessiné ensuite masque leur partie basse */}
      <SvgImage
        x={CUISINE_L + 2}
        y={WET_TOP - 15}
        width={23}
        height={28}
        preserveAspectRatio="xMidYMid meet"
        href={require('../../assets/images/toilets.png')}
      />
      {/* Mur blanc sous le lit, prolongé à 5 cases (jusque sous les WC) */}
      <WallFace x={LIT_L} base={CHAMBRE_BOT} w={5 * COL} p={p} />

      {/* ---------------- Murs ---------------- */}
      {/* Façade et murs hauts : dessinés en faces 3D plus haut (WallFace) */}

      {/* Cloison bureau / chambre (aucune porte) : trait de 3, centré sur
          la strie du parquet */}
      <WallV x={CHAMBRE_L - 1.5} y={HOUSE_TOP} h={CHAMBRE_BOT - HOUSE_TOP} w={3} p={p} />

      {/* Cloison chambre / cuisine+WC : trait de 3, centré sur la strie */}
      <WallV x={CUISINE_L - 1.5} y={HOUSE_TOP} h={CHAMBRE_BOT - HOUSE_TOP - 24} w={3} p={p} />

      {/* Bureau → couloir : la porte occupe toute l'ouverture (aucun mur) */}

      {/* Salle de bain, bord droit : trait de 3 centré sur la strie —
          depuis le bas : 1 case de mur, 2 cases de porte, puis mur jusqu'au
          haut du mur blanc de la douche */}
      <WallV x={SDB_R - 1.5} y={SDB_TOP - WALL_H} h={WALL_H + COL} w={3} p={p} />
      <WallV x={SDB_R - 1.5} y={RY(9)} h={SDB_BOT - RY(9)} w={3} p={p} />

      {/* WC et murs extérieurs : aucune ligne, les sols suffisent */}

      {/* ---------------- Meubles hauts (par-dessus les murs) ---------------- */}
      {/* PC vintage Gen 3 (×1,5), centré sur la table du bureau */}
      <PixelSprite
        x={10}
        y={RY(0) - 18}
        scale={1.5}
        grid={PC_GRID}
        colors={{
          K: p.outline,
          W: p.porcelain,
          S: p.sofaLight,
          B: p.sofaDark,
          L: p.window,
          D: p.greyRugEdge,
          T: p.tub,
          V: p.treeLight,
          M: p.railing,
        }}
      />
    </Svg>
  );
});
