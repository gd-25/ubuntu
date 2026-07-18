import { memo } from 'react';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { FLAT_BOTTOM, MAP_H, MAP_W, OUTSIDE_BOTTOM } from '@/lib/house';

/**
 * Le plan de l'appartement en pixel-art SVG, fidèle au vrai plan :
 * forêt + sentier en L, balcon béton sur lequel le salon déborde (avancée
 * à droite), bureau / chambre / salon, salle de bain en bas à gauche,
 * WC (avec la caméra devant la porte), grand espace ouvert salon-couloir,
 * palier d'immeuble à moquette noire. Le lit sert d'étalon : 50×71 unités
 * pour un vrai 140×200. Statique (memo) — les avatars vivent au-dessus.
 */

// Repères verticaux du bâtiment (le bloc appartement est compact ; le
// surplus de hauteur de l'écran part dans la forêt).
const HOUSE_TOP = 300;
const WET_TOP = 471; // haut de la sdb et des WC
const BUREAU_BOT = 529;
const CHAMBRE_BOT = 535;

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
  floorBureau: string;
  floorBureauLine: string;
  floorChambre: string;
  floorSalon: string;
  floorCouloir: string;
  carpet: string;
  carpetLine: string;
  doormat: string;
  tile: string;
  tileAlt: string;
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
  rug: string;
  rugEdge: string;
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
  wall: '#584050',
  floorBureau: '#C8B088',
  floorBureauLine: '#B89868',
  floorChambre: '#E0C8A0',
  floorSalon: '#D0A878',
  floorCouloir: '#D8C098',
  carpet: '#2E2E36',
  carpetLine: '#3A3A44',
  doormat: '#8A6030',
  tile: '#CFE8EC',
  tileAlt: '#BEDDE2',
  tub: '#F4F4F0',
  water: '#7EC8E0',
  porcelain: '#FFFFFF',
  wood: '#7A4A28',
  screen: '#2870C0',
  mattress: '#F0ECE0',
  pillow: '#FFFFFF',
  blanket: '#C84848',
  sofa: '#4870B8',
  sofaDark: '#38548C',
  rug: '#C87858',
  rugEdge: '#A85838',
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
  wall: '#2E2436',
  floorBureau: '#786650',
  floorBureauLine: '#685846',
  floorChambre: '#887250',
  floorSalon: '#7A6248',
  floorCouloir: '#6E5C42',
  carpet: '#212129',
  carpetLine: '#2B2B35',
  doormat: '#5E401E',
  tile: '#5E7880',
  tileAlt: '#526A72',
  tub: '#B8BCB4',
  water: '#4E90A8',
  porcelain: '#D8D8D0',
  wood: '#4A3020',
  screen: '#88C8F0',
  mattress: '#B8B4A8',
  pillow: '#D8D8D0',
  blanket: '#883838',
  sofa: '#324E80',
  sofaDark: '#263A60',
  rug: '#8A5640',
  rugEdge: '#70432E',
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
const TRAIL_Y = 120;
const TRAIL_H = 30;
const TRAIL_STUB_X = 288;
const TRAIL_STUB_W = 30;

export const HouseMap = memo(function HouseMap({ night }: { night: boolean }) {
  const p = night ? NIGHT : DAY;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
      {/* ---------------- Dehors : forêt + sentier en L ---------------- */}
      <Rect x={0} y={0} width={MAP_W} height={OUTSIDE_BOTTOM} fill={p.grass} />
      {Array.from({ length: 9 }).map((_, col) =>
        Array.from({ length: 5 }).map((_, row) =>
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
      {/* Branche horizontale du sentier (parallèle au balcon) */}
      <Rect x={20} y={TRAIL_Y} width={TRAIL_STUB_X + TRAIL_STUB_W - 20} height={TRAIL_H} fill={p.path} />
      <Rect x={20} y={TRAIL_Y} width={TRAIL_STUB_X + TRAIL_STUB_W - 20} height={3} fill={p.pathEdge} />
      <Rect x={20} y={TRAIL_Y + TRAIL_H - 3} width={TRAIL_STUB_X - 20} height={3} fill={p.pathEdge} />
      {/* Branche verticale : sortie de l'immeuble, à droite */}
      <Rect x={TRAIL_STUB_X} y={TRAIL_Y + 3} width={TRAIL_STUB_W} height={OUTSIDE_BOTTOM - TRAIL_Y - 3} fill={p.path} />
      <Rect x={TRAIL_STUB_X} y={TRAIL_Y + TRAIL_H} width={3} height={OUTSIDE_BOTTOM - TRAIL_Y - TRAIL_H} fill={p.pathEdge} />
      <Rect x={TRAIL_STUB_X + TRAIL_STUB_W - 3} y={TRAIL_Y + 3} width={3} height={OUTSIDE_BOTTOM - TRAIL_Y - 3} fill={p.pathEdge} />
      {/* Arbres au-dessus du sentier */}
      <Tree x={16} y={74} p={p} />
      <Tree x={76} y={68} p={p} />
      <Tree x={136} y={76} p={p} />
      <Tree x={196} y={66} p={p} />
      <Tree x={250} y={74} p={p} />
      <Tree x={312} y={68} p={p} />
      {/* Fleurs */}
      <Flower x={60} y={104} color={p.flower1} />
      <Flower x={150} y={98} color={p.flower2} />
      <Flower x={262} y={102} color={p.flower1} />
      <Flower x={70} y={162} color={p.flower2} />
      <Flower x={180} y={166} color={p.flower1} />
      <Flower x={240} y={160} color={p.flower2} />
      <Flower x={110} y={40} color={p.flower1} />
      <Flower x={250} y={30} color={p.flower2} />

      {/* ---------------- Balcon (béton) ---------------- */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={MAP_W} height={HOUSE_TOP - OUTSIDE_BOTTOM} fill={p.concrete} />
      {[0, 1].map((i) => (
        <Line
          key={`cj${i}`}
          x1={0}
          y1={OUTSIDE_BOTTOM + 36 + i * 32}
          x2={MAP_W}
          y2={OUTSIDE_BOTTOM + 36 + i * 32}
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
      {/* Rambarde continue côté forêt */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={MAP_W} height={6} fill={p.railing} />
      {Array.from({ length: 15 }).map((_, i) => (
        <Rect key={`post${i}`} x={4 + i * 24} y={OUTSIDE_BOTTOM + 6} width={5} height={8} fill={p.railing} />
      ))}

      {/* ---------------- Avancée du salon sur le balcon ---------------- */}
      <Rect x={262} y={214} width={98} height={HOUSE_TOP - 214} fill={p.floorSalon} />
      <Rect x={262} y={212} width={98} height={5} fill={p.wall} />
      <Rect x={260} y={212} width={4} height={16} fill={p.wall} />
      <Rect x={260} y={276} width={4} height={HOUSE_TOP - 276} fill={p.wall} />

      {/* ---------------- Sols de l'appartement ---------------- */}
      <Rect x={0} y={HOUSE_TOP} width={105} height={BUREAU_BOT - HOUSE_TOP} fill={p.floorBureau} />
      <Rect x={0} y={WET_TOP} width={72} height={FLAT_BOTTOM - WET_TOP} fill={p.tile} />
      <Rect x={105} y={HOUSE_TOP} width={91} height={CHAMBRE_BOT - HOUSE_TOP} fill={p.floorChambre} />
      <Rect x={196} y={HOUSE_TOP} width={164} height={FLAT_BOTTOM - HOUSE_TOP} fill={p.floorSalon} />
      <Rect x={196} y={WET_TOP} width={78} height={CHAMBRE_BOT - WET_TOP} fill={p.tile} />
      <Rect x={72} y={BUREAU_BOT} width={124} height={FLAT_BOTTOM - BUREAU_BOT} fill={p.floorCouloir} />
      {/* Palier (moquette noire) */}
      <Rect x={0} y={FLAT_BOTTOM} width={MAP_W} height={MAP_H - FLAT_BOTTOM} fill={p.carpet} />
      {[0, 1].map((i) => (
        <Line
          key={`ca${i}`}
          x1={0}
          y1={FLAT_BOTTOM + 22 + i * 20}
          x2={MAP_W}
          y2={FLAT_BOTTOM + 22 + i * 20}
          stroke={p.carpetLine}
          strokeWidth={2}
        />
      ))}

      {/* Parquet du bureau (les lattes de gauche s'arrêtent sur la sdb) */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Line
          key={`pq${i}`}
          x1={16 + i * 16}
          y1={HOUSE_TOP}
          x2={16 + i * 16}
          y2={16 + i * 16 < 72 ? WET_TOP : BUREAU_BOT}
          stroke={p.floorBureauLine}
          strokeWidth={1.5}
        />
      ))}
      {/* Carrelage damier de la salle de bain */}
      {Array.from({ length: 4 }).map((_, col) =>
        Array.from({ length: 9 }).map((_, row) =>
          (col + row) % 2 === 0 ? (
            <Rect
              key={`t${col}-${row}`}
              x={col * 18}
              y={WET_TOP + row * 20}
              width={18}
              height={Math.min(20, FLAT_BOTTOM - (WET_TOP + row * 20))}
              fill={p.tileAlt}
            />
          ) : null
        )
      )}
      {/* Carrelage du WC */}
      {Array.from({ length: 4 }).map((_, col) =>
        Array.from({ length: 4 }).map((_, row) =>
          (col + row) % 2 === 0 ? (
            <Rect
              key={`w${col}-${row}`}
              x={196 + col * 20}
              y={WET_TOP + row * 20}
              width={Math.min(20, 274 - (196 + col * 20))}
              height={Math.min(20, CHAMBRE_BOT - (WET_TOP + row * 20))}
              fill={p.tileAlt}
            />
          ) : null
        )
      )}

      {/* ---------------- Meubles ---------------- */}
      {/* Bureau : bureau + écran + chaise */}
      <Rect x={10} y={HOUSE_TOP + 12} width={72} height={22} fill={p.wood} />
      <Rect x={28} y={HOUSE_TOP} width={24} height={14} fill={p.screen} />
      <Rect x={34} y={HOUSE_TOP + 40} width={20} height={16} fill={p.railing} />

      {/* Salle de bain : baignoire + lavabo */}
      <Rect x={6} y={WET_TOP + 10} width={38} height={60} fill={p.tub} />
      <Rect x={11} y={WET_TOP + 16} width={28} height={48} fill={p.water} />
      <Rect x={50} y={WET_TOP + 6} width={18} height={14} fill={p.tub} />

      {/* Chambre : lit 140×200 (50×71) contre le mur droit */}
      <Rect x={144} y={436} width={50} height={71} fill={p.wood} />
      <Rect x={147} y={439} width={44} height={65} fill={p.mattress} />
      <Rect x={151} y={443} width={36} height={12} fill={p.pillow} />
      <Rect x={147} y={459} width={44} height={45} fill={p.blanket} />
      <Rect x={147} y={459} width={44} height={4} fill={p.pillow} />
      {/* Tapis de la chambre */}
      <Rect x={112} y={442} width={24} height={20} fill={p.rug} />

      {/* WC : cuvette + réservoir */}
      <Rect x={244} y={WET_TOP + 4} width={24} height={8} fill={p.porcelain} />
      <Rect x={248} y={WET_TOP + 12} width={17} height={16} fill={p.porcelain} />
      <Rect x={252} y={WET_TOP + 16} width={9} height={8} fill={p.tileAlt} />

      {/* Salon : canapé (90×180 → 32×64) vertical contre le mur droit */}
      <Rect x={322} y={468} width={34} height={68} fill={p.sofaDark} />
      <Rect x={324} y={472} width={22} height={60} fill={p.sofa} />
      <Rect x={326} y={476} width={18} height={16} fill={p.sofaDark} />
      <Rect x={326} y={496} width={18} height={16} fill={p.sofaDark} />
      <Rect x={326} y={516} width={18} height={16} fill={p.sofaDark} />
      {/* Tapis du salon */}
      <Rect x={214} y={370} width={92} height={56} fill={p.rugEdge} />
      <Rect x={218} y={374} width={84} height={48} fill={p.rug} />

      {/* Palier : paillasson devant la porte d'entrée */}
      <Rect x={200} y={FLAT_BOTTOM + 6} width={44} height={16} fill={p.doormat} />

      {/* ---------------- Murs ---------------- */}
      {/* Façade côté balcon : portes chambre (x112..140) et salon (x224..253) */}
      <Rect x={0} y={HOUSE_TOP - 3} width={112} height={6} fill={p.wall} />
      <Rect x={140} y={HOUSE_TOP - 3} width={84} height={6} fill={p.wall} />
      <Rect x={253} y={HOUSE_TOP - 3} width={9} height={6} fill={p.wall} />
      {/* Fenêtre du bureau */}
      <Rect x={30} y={HOUSE_TOP - 4} width={36} height={8} fill={p.window} />

      {/* Cloison bureau / chambre (aucune porte) */}
      <Rect x={103} y={HOUSE_TOP} width={4} height={BUREAU_BOT - HOUSE_TOP} fill={p.wall} />

      {/* Cloison chambre / salon+WC (aucune porte) */}
      <Rect x={194} y={HOUSE_TOP} width={4} height={CHAMBRE_BOT - HOUSE_TOP} fill={p.wall} />

      {/* Mur bas du bureau vers le couloir (la porte occupe presque tout) */}
      <Rect x={72} y={BUREAU_BOT - 2} width={6} height={4} fill={p.wall} />
      <Rect x={100} y={BUREAU_BOT - 2} width={5} height={4} fill={p.wall} />

      {/* Salle de bain : mur haut plein + mur droit avec porte vers le couloir */}
      <Rect x={0} y={WET_TOP - 2} width={72} height={4} fill={p.wall} />
      <Rect x={70} y={WET_TOP} width={4} height={80} fill={p.wall} />
      <Rect x={70} y={FLAT_BOTTOM - 22} width={4} height={22} fill={p.wall} />

      {/* Chambre : mur bas avec porte vers le couloir (x112..140) */}
      <Rect x={105} y={CHAMBRE_BOT - 2} width={7} height={4} fill={p.wall} />
      <Rect x={140} y={CHAMBRE_BOT - 2} width={56} height={4} fill={p.wall} />

      {/* WC : mur haut, mur droit, mur bas avec porte (x234..262) — caméra devant */}
      <Rect x={196} y={WET_TOP - 2} width={78} height={4} fill={p.wall} />
      <Rect x={272} y={WET_TOP} width={4} height={CHAMBRE_BOT - WET_TOP} fill={p.wall} />
      <Rect x={196} y={CHAMBRE_BOT - 2} width={38} height={4} fill={p.wall} />
      <Rect x={262} y={CHAMBRE_BOT - 2} width={14} height={4} fill={p.wall} />

      {/* Mur de l'appartement vs palier, porte d'entrée x205..232 */}
      <Rect x={0} y={FLAT_BOTTOM - 3} width={205} height={6} fill={p.wall} />
      <Rect x={232} y={FLAT_BOTTOM - 3} width={MAP_W - 232} height={6} fill={p.wall} />

      {/* Murs extérieurs */}
      <Rect x={0} y={HOUSE_TOP - 3} width={4} height={MAP_H - HOUSE_TOP + 3} fill={p.wall} />
      <Rect x={MAP_W - 4} y={212} width={4} height={MAP_H - 212} fill={p.wall} />
      <Rect x={0} y={MAP_H - 4} width={MAP_W} height={4} fill={p.wall} />
    </Svg>
  );
});
