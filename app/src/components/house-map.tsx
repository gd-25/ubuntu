import { memo, type ReactElement } from 'react';
import Svg, { G, Line, Rect } from 'react-native-svg';

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
 *   cols 4-5   couloir du bureau      sdb rangées 5-9 (5), wc rangées 5-6
 *   cols 11-14 WC (4×2)               bas de l'appartement = rangée 10
 */

// Grille : rangée 0 en haut de la maison, colonnes depuis le bord gauche.
const HOUSE_TOP = 449;
const CX = (c: number) => c * COL;
const RY = (r: number) => HOUSE_TOP + r * COL;

// Repères verticaux (tous sur la grille).
const ARMOIRE_TOP = RY(4); // 513 — rangée de l'armoire du bureau
const WET_TOP = RY(5); // 529 — haut des WC et de la salle de bain
const SDB_BOT = RY(10); // 609 — bas de la sdb = bas de l'appartement
const CHAMBRE_BOT = RY(7); // 561 — bas de la chambre et des WC
const EXT_TOP = RY(-2); // 417 — avancée du salon : 2 cases sur le balcon

// Frontières verticales de colonnes.
const CHAMBRE_L = CX(6); // 96 — bureau | chambre
const CUISINE_L = CX(11); // 176 — chambre | cuisine/salon
const SALON_L = CX(16); // 256 — cuisine | salon, et bord gauche de l'avancée
const SDB_R = CX(4); // 64 — sdb | couloir du bureau
const WC_R = CX(15); // 240 — bord droit des WC
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
      <Rect x={x} y={base - WALL_H} width={w} height={3} fill={p.wall} />
      <Rect x={x} y={base - WALL_H + 3} width={w} height={2} fill={p.wallFaceLight} />
      <Rect x={x} y={base - 2} width={w} height={2} fill={p.outline} />
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
  /** Tranches de livres colorées de la bibliothèque de l'entrée. */
  const books = [p.flower2, p.screen, p.flower1, p.treeLight, p.sofa];

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
      {/* Rambarde côté forêt, posée à l'EXTÉRIEUR du balcon */}
      <Rect x={0} y={OUTSIDE_BOTTOM - 6} width={MAP_W} height={6} fill={p.railing} />

      {/* ---------------- Sols ---------------- */}
      {/* Parquet commun : tout l'appartement (bureau compris) + avancée */}
      <Rect x={0} y={HOUSE_TOP} width={MAP_W} height={FLAT_BOTTOM - HOUSE_TOP} fill={p.parquet} />
      <Rect x={SALON_L} y={EXT_TOP} width={MAP_W - SALON_L} height={HOUSE_TOP - EXT_TOP} fill={p.parquet} />
      {/* Salle de bain + WC : carrelage en damier 16×16 aligné sur la grille */}
      <Rect x={0} y={WET_TOP} width={SDB_R} height={SDB_BOT - WET_TOP} fill={p.tile} />
      <CheckerTiles x0={0} x1={SDB_R} y0={WET_TOP} y1={SDB_BOT} fill={p.tileAlt} />
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
            : x > CUISINE_L && x < WC_R
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
      {/* Salon : tapis beige 5×6, bordure + damier tissé (style Pokémon) */}
      <Rect x={CX(17)} y={RY(4)} width={5 * COL} height={6 * COL} fill={p.beigeRugEdge} />
      <Rect x={CX(17) + 3} y={RY(4) + 3} width={5 * COL - 6} height={6 * COL - 6} fill={p.beigeRug} />
      {Array.from({ length: 9 }).map((_, cx) =>
        Array.from({ length: 11 }).map((_, cy) =>
          (cx + cy) % 2 === 0 ? (
            <Rect
              key={`br${cx}-${cy}`}
              x={CX(17) + 6 + cx * 8}
              y={RY(4) + 6 + cy * 8}
              width={4}
              height={4}
              fill={p.beigeRugEdge}
            />
          ) : null
        )
      )}
      {/* Bureau : tapis gris 3×3, bordure + points tissés */}
      <Rect x={0} y={RY(0)} width={3 * COL} height={3 * COL} fill={p.greyRugEdge} />
      <Rect x={2} y={RY(0) + 2} width={3 * COL - 4} height={3 * COL - 4} fill={p.greyRug} />
      {Array.from({ length: 8 }).map((_, cx) =>
        Array.from({ length: 8 }).map((_, cy) =>
          (cx + cy) % 2 === 0 ? (
            <Rect
              key={`rt${cx}-${cy}`}
              x={5 + cx * 5}
              y={RY(0) + 5 + cy * 5}
              width={2}
              height={2}
              fill={p.greyRugEdge}
            />
          ) : null
        )
      )}

      {/* ------------- Faces des murs (2 cases, au-dessus de la base) ------- */}
      {/* Façade côté balcon : la face recouvre les 2 rangées de balcon
          derrière elle (portes = trouées, le sol du balcon y passe) */}
      <WallFace x={0} base={HOUSE_TOP} w={CHAMBRE_L} p={p} />
      <WallFace x={LIT_L} base={HOUSE_TOP} w={224 - LIT_L} p={p} />
      {/* Mur haut de l'avancée du salon + grande baie vitrée de 4 cases */}
      <WallFace x={SALON_L} base={EXT_TOP} w={MAP_W - SALON_L} p={p} />
      <Rect x={CX(17)} y={EXT_TOP - 21} width={4 * COL} height={19} fill={p.outline} />
      <Rect x={CX(17) + 1} y={EXT_TOP - 20} width={4 * COL - 2} height={17} fill={p.window} />
      <Rect x={CX(17) + 21} y={EXT_TOP - 20} width={2} height={17} fill={p.outline} />
      <Rect x={CX(17) + 42} y={EXT_TOP - 20} width={2} height={17} fill={p.outline} />
      <Rect x={CX(17) + 4} y={EXT_TOP - 17} width={9} height={4} fill={p.porcelain} />
      <Rect x={CX(17) + 26} y={EXT_TOP - 17} width={9} height={4} fill={p.porcelain} />
      <Rect x={CX(17) + 47} y={EXT_TOP - 17} width={9} height={4} fill={p.porcelain} />
      {/* Murs hauts de la sdb et des wc (montent dans le bureau/la cuisine,
          l'armoire et le meuble cuisine se dessinent devant) */}
      <WallFace x={0} base={WET_TOP} w={SDB_R} p={p} />
      <WallFace x={CUISINE_L} base={WET_TOP} w={WC_R - CUISINE_L} p={p} />
      {/* Bouts des cloisons verticales */}
      <WallFace x={CHAMBRE_L - 2} base={CHAMBRE_BOT} w={3} p={p} />
      <WallFace x={WC_R - 3} base={CHAMBRE_BOT} w={3} p={p} />
      <WallFace x={SDB_R - 2} base={RY(6)} w={3} p={p} />
      {/* Mur du palier : face côté palier (mur extérieur de l'appartement) */}
      <WallFace x={0} base={FLAT_BOTTOM + WALL_H} w={208} p={p} />
      <WallFace x={240} base={FLAT_BOTTOM + WALL_H} w={MAP_W - 240} p={p} />

      {/* ---------------- Meubles (pixel-art 3D, contours sombres) --------- */}
      {/* Bureau : table 3 cases de large, sous-main vert, pieds métal
          (le PC est dessiné après les murs, il les chevauche) */}
      <Rect x={0} y={RY(0)} width={3 * COL} height={14} rx={2} fill={p.outline} />
      <Rect x={1} y={RY(0) + 1} width={3 * COL - 2} height={8} fill={p.treeLight} />
      <Rect x={1} y={RY(0) + 9} width={3 * COL - 2} height={4} fill={p.tub} />
      <Rect x={3} y={RY(0) + 14} width={6} height={6} fill={p.outline} />
      <Rect x={4} y={RY(0) + 14} width={4} height={5} fill={p.railing} />
      <Rect x={39} y={RY(0) + 14} width={6} height={6} fill={p.outline} />
      <Rect x={40} y={RY(0) + 14} width={4} height={5} fill={p.railing} />

      {/* Armoire merisier 4×1 : dessus clair, portes, poignées */}
      <Rect x={0} y={ARMOIRE_TOP} width={4 * COL} height={14} fill={p.outline} />
      <Rect x={1} y={ARMOIRE_TOP + 1} width={4 * COL - 2} height={4} fill={p.merisierLight} />
      <Rect x={1} y={ARMOIRE_TOP + 5} width={4 * COL - 2} height={8} fill={p.merisier} />
      <Rect x={21} y={ARMOIRE_TOP + 5} width={1} height={8} fill={p.merisierDark} />
      <Rect x={42} y={ARMOIRE_TOP + 5} width={1} height={8} fill={p.merisierDark} />
      <Rect x={17} y={ARMOIRE_TOP + 8} width={2} height={3} fill={p.merisierDark} />
      <Rect x={45} y={ARMOIRE_TOP + 8} width={2} height={3} fill={p.merisierDark} />

      {/* Douche 4×1,5 : grand receveur arrondi, fond bleuté, bonde, pomme */}
      <Rect x={2} y={WET_TOP + 2} width={4 * COL - 4} height={22} rx={5} fill={p.outline} />
      <Rect x={3} y={WET_TOP + 3} width={4 * COL - 6} height={20} rx={4} fill={p.tub} />
      <Rect x={7} y={WET_TOP + 7} width={4 * COL - 14} height={12} rx={4} fill={p.tileAlt} />
      <Rect x={30} y={WET_TOP + 11} width={5} height={4} rx={2} fill={p.greyRugEdge} />
      <Rect x={5} y={WET_TOP + 4} width={3} height={8} rx={1} fill={p.railing} />
      <Rect x={4} y={WET_TOP + 12} width={6} height={5} rx={2} fill={p.greyRug} />
      <Rect x={12} y={WET_TOP + 10} width={2} height={2} fill={p.window} />
      <Rect x={15} y={WET_TOP + 14} width={2} height={2} fill={p.window} />
      <Rect x={12} y={WET_TOP + 17} width={2} height={2} fill={p.window} />

      {/* Baignoire 4×1,5 : grande pilule, eau, robinet à droite */}
      <Rect x={1} y={FLAT_BOTTOM - 25} width={4 * COL - 2} height={22} rx={10} fill={p.outline} />
      <Rect x={2} y={FLAT_BOTTOM - 24} width={4 * COL - 4} height={20} rx={9} fill={p.tub} />
      <Rect x={7} y={FLAT_BOTTOM - 20} width={4 * COL - 22} height={12} rx={6} fill={p.water} />
      <Rect x={10} y={FLAT_BOTTOM - 17} width={12} height={3} rx={1} fill={p.tileAlt} />
      <Rect x={52} y={FLAT_BOTTOM - 22} width={8} height={5} rx={1} fill={p.railing} />
      <Rect x={55} y={FLAT_BOTTOM - 17} width={2} height={4} fill={p.railing} />

      {/* Lit 3×4 remonté d'une case (rangées 2-5) : cadre bois arrondi,
          couette à motifs, drap, oreiller — le mur du bas le masquera */}
      <Rect x={LIT_L} y={RY(2)} width={48} height={4 * COL} rx={5} fill={p.outline} />
      <Rect x={LIT_L + 1} y={RY(2) + 1} width={46} height={4 * COL - 2} rx={4} fill={p.wood} />
      <Rect x={LIT_L + 3} y={RY(2) + 3} width={42} height={4 * COL - 8} rx={3} fill={p.mattress} />
      <Rect x={LIT_L + 3} y={RY(2) + 5} width={42} height={36} rx={3} fill={p.blanket} />
      <Rect x={LIT_L + 3} y={RY(2) + 5} width={42} height={4} rx={2} fill={p.sofaDark} />
      {Array.from({ length: 5 }).map((_, i) =>
        Array.from({ length: 4 }).map((_, j) =>
          (i + j) % 2 === 0 ? (
            <Rect
              key={`bl${i}-${j}`}
              x={LIT_L + 6 + i * 8}
              y={RY(2) + 10 + j * 8}
              width={4}
              height={4}
              fill={p.sofaDark}
            />
          ) : null
        )
      )}
      <Rect x={LIT_L + 3} y={RY(2) + 39} width={42} height={3} fill={p.pillow} />
      <Rect x={LIT_L + 6} y={RY(2) + 46} width={36} height={13} rx={5} fill={p.greyRugEdge} />
      <Rect x={LIT_L + 7} y={RY(2) + 47} width={34} height={11} rx={4} fill={p.porcelain} />

      {/* WC : réservoir à bouton contre la cloison + cuvette ronde à lunette */}
      <Rect x={CUISINE_L + 1} y={WET_TOP + 6} width={7} height={20} rx={2} fill={p.outline} />
      <Rect x={CUISINE_L + 2} y={WET_TOP + 7} width={5} height={18} rx={2} fill={p.porcelain} />
      <Rect x={CUISINE_L + 3} y={WET_TOP + 9} width={3} height={3} rx={1} fill={p.railing} />
      <Rect x={CUISINE_L + 3} y={WET_TOP + 14} width={3} height={1} fill={p.greyRugEdge} />
      <Rect x={CUISINE_L + 7} y={WET_TOP + 9} width={14} height={14} rx={7} fill={p.outline} />
      <Rect x={CUISINE_L + 8} y={WET_TOP + 10} width={12} height={12} rx={6} fill={p.porcelain} />
      <Rect x={CUISINE_L + 11} y={WET_TOP + 13} width={6} height={6} rx={3} fill={p.tileAlt} />
      <Rect x={CUISINE_L + 11} y={WET_TOP + 14} width={2} height={2} fill={p.water} />

      {/* Canapé 2×3 : dossier et accoudoirs en barres rondes, 2 coussins */}
      <Rect x={CX(20)} y={RY(5)} width={2 * COL} height={3 * COL} rx={5} fill={p.outline} />
      <Rect x={CX(20) + 1} y={RY(5) + 1} width={30} height={3 * COL - 2} rx={4} fill={p.sofaLight} />
      <Rect x={CX(20) + 23} y={RY(5) + 2} width={8} height={3 * COL - 4} rx={4} fill={p.greyRug} />
      <Rect x={CX(20) + 2} y={RY(5) + 1} width={26} height={8} rx={4} fill={p.greyRug} />
      <Rect x={CX(20) + 2} y={RY(5) + 39} width={26} height={8} rx={4} fill={p.greyRug} />
      <Rect x={CX(20) + 4} y={RY(5) + 11} width={20} height={12} rx={3} fill={p.sofaLight} />
      <Rect x={CX(20) + 4} y={RY(5) + 25} width={20} height={12} rx={3} fill={p.sofaLight} />
      <Rect x={CX(20) + 4} y={RY(5) + 23} width={20} height={2} fill={p.greyRugEdge} />

      {/* Table basse 2×2 : plateau bois clair, chant sombre */}
      <Rect x={CX(17)} y={RY(7)} width={2 * COL} height={2 * COL} fill={p.outline} />
      <Rect x={CX(17) + 1} y={RY(7) + 1} width={30} height={24} fill={p.woodLight} />
      <Rect x={CX(17) + 1} y={RY(7) + 25} width={30} height={6} fill={p.wood} />
      <Rect x={CX(17) + 3} y={RY(7) + 3} width={26} height={2} fill={p.merisierLight} />

      {/* Colonne cuisine : dessus clair, flanc ombré, portes + poignées */}
      <Rect x={CUISINE_L} y={HOUSE_TOP} width={COL} height={RY(4) - HOUSE_TOP} rx={2} fill={p.outline} />
      <Rect x={CUISINE_L + 1} y={HOUSE_TOP + 1} width={COL - 2} height={62} rx={2} fill={p.merisier} />
      <Rect x={CUISINE_L + 1} y={HOUSE_TOP + 1} width={COL - 2} height={4} rx={2} fill={p.merisierLight} />
      <Rect x={CUISINE_L + COL - 3} y={HOUSE_TOP + 3} width={2} height={58} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 1} y={HOUSE_TOP + 32} width={COL - 4} height={1} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 8} y={HOUSE_TOP + 27} width={2} height={4} rx={1} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 8} y={HOUSE_TOP + 35} width={2} height={4} rx={1} fill={p.merisierDark} />
      {/* Meuble cuisine 4×1 : plan de travail, évier inox, façades */}
      <Rect x={CUISINE_L} y={RY(4)} width={4 * COL} height={14} fill={p.outline} />
      <Rect x={CUISINE_L + 1} y={RY(4) + 1} width={4 * COL - 2} height={6} fill={p.merisierLight} />
      <Rect x={CUISINE_L + 1} y={RY(4) + 7} width={4 * COL - 2} height={6} fill={p.merisier} />
      <Rect x={CUISINE_L + 21} y={RY(4) + 7} width={1} height={6} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 42} y={RY(4) + 7} width={1} height={6} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 10} y={RY(4) + 9} width={2} height={2} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 31} y={RY(4) + 9} width={2} height={2} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 52} y={RY(4) + 9} width={2} height={2} fill={p.merisierDark} />
      <Rect x={CUISINE_L + 40} y={RY(4) + 1} width={16} height={6} rx={2} fill={p.railing} />
      <Rect x={CUISINE_L + 42} y={RY(4) + 2} width={12} height={4} rx={1} fill={p.greyRug} />
      <Rect x={CUISINE_L + 6} y={RY(4) + 1} width={6} height={6} rx={3} fill={p.outline} />
      <Rect x={CUISINE_L + 8} y={RY(4) + 3} width={2} height={2} fill={p.greyRug} />
      <Rect x={CUISINE_L + 16} y={RY(4) + 1} width={6} height={6} rx={3} fill={p.outline} />
      <Rect x={CUISINE_L + 18} y={RY(4) + 3} width={2} height={2} fill={p.greyRug} />

      {/* Grande table blanche 4×2 : plateau arrondi, pieds, petite plante */}
      <Rect x={CX(17) + 2} y={RY(-1) + 24} width={5} height={7} rx={1} fill={p.outline} />
      <Rect x={CX(17) + 57} y={RY(-1) + 24} width={5} height={7} rx={1} fill={p.outline} />
      <Rect x={CX(17) + 3} y={RY(-1) + 24} width={3} height={6} fill={p.greyRugEdge} />
      <Rect x={CX(17) + 58} y={RY(-1) + 24} width={3} height={6} fill={p.greyRugEdge} />
      <Rect x={CX(17)} y={RY(-1)} width={4 * COL} height={26} rx={4} fill={p.outline} />
      <Rect x={CX(17) + 1} y={RY(-1) + 1} width={62} height={20} rx={3} fill={p.tub} />
      <Rect x={CX(17) + 1} y={RY(-1) + 21} width={62} height={4} rx={2} fill={p.sofaLight} />
      <Rect x={CX(17) + 27} y={RY(-1) + 4} width={10} height={6} rx={2} fill={p.treeLight} />
      <Rect x={CX(17) + 29} y={RY(-1) + 9} width={6} height={5} rx={1} fill={p.merisier} />

      {/* Étagères 9×1 : bibliothèque à livres colorés */}
      <Rect x={SDB_R} y={RY(9)} width={9 * COL} height={14} fill={p.outline} />
      <Rect x={SDB_R + 1} y={RY(9) + 1} width={9 * COL - 2} height={3} fill={p.sofaLight} />
      <Rect x={SDB_R + 1} y={RY(9) + 4} width={9 * COL - 2} height={9} fill={p.greyRug} />
      {Array.from({ length: 27 }).map((_, i) => (
        <Rect
          key={`bk${i}`}
          x={SDB_R + 3 + i * 5}
          y={RY(9) + 5}
          width={4}
          height={7}
          fill={books[i % books.length]}
        />
      ))}

      {/* Bas de la chambre : dessiné APRÈS le lit pour le masquer de 0,5 case */}
      <WallFace x={LIT_L} base={CHAMBRE_BOT} w={CUISINE_L - LIT_L} p={p} />

      {/* ---------------- Murs ---------------- */}
      {/* Façade et murs hauts : dessinés en faces 3D plus haut (WallFace) */}

      {/* Cloison bureau / chambre (aucune porte), affleure la façade en haut */}
      <Rect x={CHAMBRE_L - 2} y={HOUSE_TOP - 3} width={3} height={CHAMBRE_BOT - HOUSE_TOP + 3} fill={p.wall} />

      {/* Cloison chambre / salon+WC (aucune porte) */}
      <Rect x={CUISINE_L - 2} y={HOUSE_TOP} width={3} height={CHAMBRE_BOT - HOUSE_TOP + 1} fill={p.wall} />

      {/* Bureau → couloir : la porte occupe toute l'ouverture (aucun mur) */}

      {/* Salle de bain : bord droit mur 2 / porte 2 / mur 1 (murs haut et
          bas dessinés en faces 3D) */}
      <Rect x={SDB_R - 2} y={WET_TOP - 2} width={3} height={2 * COL + 2} fill={p.wall} />
      <Rect x={SDB_R - 2} y={RY(9)} width={3} height={SDB_BOT - RY(9) + 1} fill={p.wall} />

      {/* WC : mur droit + mur bas avec porte de 2 (cols 13-14) */}
      <Rect x={WC_R - 3} y={WET_TOP - 2} width={3} height={CHAMBRE_BOT - WET_TOP + 3} fill={p.wall} />
      <Rect x={CUISINE_L} y={CHAMBRE_BOT - 2} width={2 * COL} height={3} fill={p.wall} />

      {/* Murs extérieurs */}
      <Rect x={0} y={HOUSE_TOP - 3} width={3} height={MAP_H - HOUSE_TOP + 3} fill={p.wall} />
      <Rect x={MAP_W - 3} y={EXT_TOP - 3} width={3} height={MAP_H - EXT_TOP + 3} fill={p.wall} />
      <Rect x={0} y={MAP_H - 3} width={MAP_W} height={3} fill={p.wall} />

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
