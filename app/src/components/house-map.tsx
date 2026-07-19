import { memo } from 'react';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { FLAT_BOTTOM, MAP_H, MAP_W, OUTSIDE_BOTTOM } from '@/lib/house';

/**
 * Le plan de l'appartement en pixel-art SVG, fidèle au vrai plan et aux
 * vraies proportions (chambre ≈ 2 lits de haut). Grande forêt + sentier
 * en L, balcon béton sur lequel l'avancée du salon mange 2/3 de la
 * profondeur à droite, parquet identique partout sauf bureau (moquette)
 * et pièces d'eau (carrelage). Statique (memo).
 */

// Repères verticaux du bâtiment.
const HOUSE_TOP = 449;
const WET_TOP = 559; // haut des WC (pièce basse et longue)
const SDB_TOP = 567; // haut de la salle de bain (un carreau plus bas)
const BUREAU_BOT = 589;
const CHAMBRE_BOT = 589;
// Avancée du salon sur le balcon : les 2 dalles du bas.
const EXT_TOP = 410;

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
        Array.from({ length: 9 }).map((_, row) =>
          (col + row) % 2 === 0 ? (
            <Rect
              key={`g${col}-${row}`}
              x={col * 40}
              y={row * 40}
              width={40}
              height={40}
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
      <Tree x={326} y={341} p={p} />
      {/* Fleurs */}
      <Flower x={60} y={80} color={p.flower1} />
      <Flower x={170} y={140} color={p.flower2} />
      <Flower x={280} y={70} color={p.flower1} />
      <Flower x={110} y={200} color={p.flower2} />
      <Flower x={230} y={190} color={p.flower1} />
      <Flower x={320} y={150} color={p.flower2} />
      <Flower x={30} y={160} color={p.flower2} />

      {/* ---------------- Balcon (béton) ---------------- */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={MAP_W} height={HOUSE_TOP - OUTSIDE_BOTTOM} fill={p.concrete} />
      {/* 3 rangées de dalles égales sous la rambarde */}
      {[0, 1].map((i) => (
        <Line
          key={`cj${i}`}
          x1={0}
          y1={OUTSIDE_BOTTOM + 26 + i * 20}
          x2={MAP_W}
          y2={OUTSIDE_BOTTOM + 26 + i * 20}
          stroke={p.concreteLine}
          strokeWidth={2}
        />
      ))}
      {Array.from({ length: 9 }).map((_, i) => (
        <Line
          key={`cv${i}`}
          x1={20 + i * 40}
          y1={OUTSIDE_BOTTOM}
          x2={20 + i * 40}
          y2={HOUSE_TOP}
          stroke={p.concreteLine}
          strokeWidth={2}
        />
      ))}
      {/* Rambarde continue côté forêt (simple ligne, sans poteaux) */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={MAP_W} height={6} fill={p.railing} />

      {/* ---------------- Sols ---------------- */}
      {/* Parquet commun : chambre + salon + couloir (+ avancée) */}
      <Rect x={105} y={HOUSE_TOP} width={255} height={FLAT_BOTTOM - HOUSE_TOP} fill={p.parquet} />
      <Rect x={72} y={BUREAU_BOT} width={33} height={FLAT_BOTTOM - BUREAU_BOT} fill={p.parquet} />
      <Rect x={262} y={EXT_TOP} width={98} height={HOUSE_TOP - EXT_TOP} fill={p.parquet} />
      {/* Lattes du parquet */}
      {Array.from({ length: 16 }).map((_, i) => {
        const x = 112 + i * 16;
        return x < 356 ? (
          <Line key={`pl${i}`} x1={x} y1={HOUSE_TOP} x2={x} y2={FLAT_BOTTOM} stroke={p.parquetLine} strokeWidth={1.5} />
        ) : null;
      })}
      {[80, 96].map((x) => (
        <Line key={`plc${x}`} x1={x} y1={BUREAU_BOT} x2={x} y2={FLAT_BOTTOM} stroke={p.parquetLine} strokeWidth={1.5} />
      ))}
      {[272, 288, 304, 320, 336, 352].map((x) => (
        <Line key={`ple${x}`} x1={x} y1={EXT_TOP} x2={x} y2={HOUSE_TOP} stroke={p.parquetLine} strokeWidth={1.5} />
      ))}
      {/* Bureau : même parquet que le reste */}
      <Rect x={0} y={HOUSE_TOP} width={105} height={BUREAU_BOT - HOUSE_TOP} fill={p.parquet} />
      {[16, 32, 48, 64, 80, 96].map((x) => (
        <Line
          key={`plb${x}`}
          x1={x}
          y1={HOUSE_TOP}
          x2={x}
          y2={x < 72 ? SDB_TOP : BUREAU_BOT}
          stroke={p.parquetLine}
          strokeWidth={1.5}
        />
      ))}
      {/* Salle de bain + WC : carrelage */}
      <Rect x={0} y={SDB_TOP} width={72} height={FLAT_BOTTOM - SDB_TOP} fill={p.tile} />
      {Array.from({ length: 4 }).map((_, col) =>
        Array.from({ length: 5 }).map((_, row) =>
          (col + row) % 2 === 0 ? (
            <Rect
              key={`t${col}-${row}`}
              x={col * 18}
              y={SDB_TOP + row * 20}
              width={18}
              height={Math.min(20, FLAT_BOTTOM - (SDB_TOP + row * 20))}
              fill={p.tileAlt}
            />
          ) : null
        )
      )}
      <Rect x={184} y={WET_TOP} width={56} height={CHAMBRE_BOT - WET_TOP} fill={p.tile} />
      {Array.from({ length: 3 }).map((_, col) =>
        Array.from({ length: 2 }).map((_, row) =>
          (col + row) % 2 === 0 ? (
            <Rect
              key={`w${col}-${row}`}
              x={184 + col * 20}
              y={WET_TOP + row * 20}
              width={Math.min(20, 240 - (184 + col * 20))}
              height={Math.min(20, CHAMBRE_BOT - (WET_TOP + row * 20))}
              fill={p.tileAlt}
            />
          ) : null
        )
      )}
      {/* Palier (moquette noire) */}
      <Rect x={0} y={FLAT_BOTTOM} width={MAP_W} height={MAP_H - FLAT_BOTTOM} fill={p.carpet} />

      {/* ---------------- Tapis ---------------- */}
      {/* Salon : tapis beige 3 m × 4 m dans le coin bas-droit de la maison */}
      <Rect x={278} y={547} width={78} height={110} fill={p.beigeRug} />
      {/* Bureau : tapis gris texturé (points tissés) en haut à gauche */}
      <Rect x={6} y={455} width={60} height={81} fill={p.greyRug} />
      {Array.from({ length: 11 }).map((_, cx) =>
        Array.from({ length: 15 }).map((_, cy) =>
          (cx + cy) % 2 === 0 ? (
            <Rect
              key={`rt${cx}-${cy}`}
              x={9 + cx * 5}
              y={458 + cy * 5}
              width={2}
              height={2}
              fill={p.greyRugEdge}
            />
          ) : null
        )
      )}

      {/* ---------------- Meubles ---------------- */}
      {/* Bureau : plateau blanc centré sur le tapis + chaise */}
      <Rect x={10} y={HOUSE_TOP + 12} width={52} height={26} fill={p.tub} />
      <Rect x={26} y={HOUSE_TOP + 44} width={20} height={14} fill={p.railing} />

      {/* Salle de bain, de bas en haut : baignoire / évier à gauche / douche */}
      {/* Douche (tiers haut, toute la largeur) */}
      <Rect x={4} y={SDB_TOP + 2} width={66} height={28} fill={p.tub} />
      {/* Évier (tiers milieu, à gauche) */}
      <Rect x={4} y={SDB_TOP + 30} width={26} height={FLAT_BOTTOM - 3 - (SDB_TOP + 30)} fill={p.greyRug} />

      {/* Chambre : lit 140×200 (50×71) contre le mur droit */}
      <Rect x={132} y={516} width={50} height={71} fill={p.wood} />
      <Rect x={135} y={519} width={44} height={65} fill={p.mattress} />
      <Rect x={135} y={519} width={44} height={45} fill={p.blanket} />
      <Rect x={135} y={560} width={44} height={4} fill={p.pillow} />
      <Rect x={139} y={568} width={36} height={12} fill={p.pillow} />

      {/* WC : cuvette à gauche, tournée vers la droite (un peu plus grande) */}
      <Rect x={186} y={WET_TOP + 7} width={5} height={17} fill={p.porcelain} />
      <Rect x={191} y={WET_TOP + 9} width={15} height={13} fill={p.porcelain} />
      <Rect x={194} y={WET_TOP + 11} width={9} height={8} fill={p.tileAlt} />

      {/* Salon : canapé gris clair 2 places collé au mur droit, sur le tapis */}
      <Rect x={322} y={554} width={34} height={68} fill={p.greyRug} />
      <Rect x={324} y={558} width={22} height={60} fill={p.sofaLight} />
      <Rect x={326} y={564} width={18} height={24} fill={p.greyRug} />
      <Rect x={326} y={592} width={18} height={24} fill={p.greyRug} />
      {/* Table basse carrée en bois, face au canapé */}
      <Rect x={282} y={590} width={32} height={32} fill={p.wood} />

      {/* Colonne cuisine merisier, collée à droite de la cloison chambre */}
      <Rect x={185} y={449} width={24} height={108} fill={p.merisier} />
      <Rect x={205} y={449} width={4} height={108} fill={p.merisierDark} />

      {/* Grande table blanche 2×1 en haut à droite du salon */}
      <Rect x={282} y={452} width={60} height={30} fill={p.tub} />

      {/* Étagères grises le long du mur du couloir, entre la sdb et l'entrée */}
      <Rect x={84} y={631} width={110} height={26} fill={p.greyRug} />
      <Rect x={84} y={639} width={110} height={2} fill={p.greyRugEdge} />
      <Rect x={84} y={648} width={110} height={2} fill={p.greyRugEdge} />


      {/* ---------------- Avancée du salon : murs ---------------- */}
      <Rect x={262} y={EXT_TOP - 3} width={98} height={3} fill={p.wall} />
      <Rect x={260} y={EXT_TOP - 3} width={3} height={17} fill={p.wall} />

      {/* ---------------- Murs ---------------- */}
      {/* Façade côté balcon : portes chambre (x112..140) et salon (x224..253) */}
      <Rect x={0} y={HOUSE_TOP - 3} width={112} height={3} fill={p.wall} />
      <Rect x={140} y={HOUSE_TOP - 3} width={84} height={3} fill={p.wall} />
      <Rect x={253} y={HOUSE_TOP - 3} width={9} height={3} fill={p.wall} />

      {/* Cloison bureau / chambre (aucune porte) */}
      <Rect x={103} y={HOUSE_TOP} width={3} height={BUREAU_BOT - HOUSE_TOP} fill={p.wall} />

      {/* Cloison chambre / salon+WC (aucune porte) */}
      <Rect x={182} y={HOUSE_TOP} width={3} height={CHAMBRE_BOT - HOUSE_TOP + 1} fill={p.wall} />

      {/* Bureau → couloir : la porte occupe toute l'ouverture (aucun mur) */}

      {/* Salle de bain : mur haut plein + mur droit avec porte vers le couloir */}
      <Rect x={0} y={SDB_TOP - 2} width={73} height={3} fill={p.wall} />
      <Rect x={70} y={SDB_TOP - 2} width={3} height={32} fill={p.wall} />

      {/* Chambre : mur bas avec porte vers le couloir (x112..140) */}
      <Rect x={132} y={CHAMBRE_BOT - 2} width={50} height={3} fill={p.wall} />

      {/* WC : mur haut, mur droit, mur bas avec porte (x234..262) — caméra devant */}
      <Rect x={184} y={WET_TOP - 2} width={56} height={3} fill={p.wall} />
      <Rect x={237} y={WET_TOP - 2} width={3} height={CHAMBRE_BOT - WET_TOP + 3} fill={p.wall} />
      <Rect x={184} y={CHAMBRE_BOT - 2} width={36} height={3} fill={p.wall} />

      {/* Mur de l'appartement vs palier, porte d'entrée x205..232 */}
      <Rect x={0} y={FLAT_BOTTOM - 3} width={205} height={3} fill={p.wall} />
      <Rect x={232} y={FLAT_BOTTOM - 3} width={MAP_W - 232} height={3} fill={p.wall} />

      {/* Murs extérieurs */}
      <Rect x={0} y={HOUSE_TOP - 3} width={3} height={MAP_H - HOUSE_TOP + 3} fill={p.wall} />
      <Rect x={MAP_W - 3} y={EXT_TOP - 3} width={3} height={MAP_H - EXT_TOP + 3} fill={p.wall} />
      <Rect x={0} y={MAP_H - 3} width={MAP_W} height={3} fill={p.wall} />
    </Svg>
  );
});
