import { memo } from 'react';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { BALCONY_BOTTOM, MAP_H, MAP_W, OUTSIDE_BOTTOM, ZONES } from '@/lib/house';

/**
 * Le plan de l'appartement en pixel-art SVG, façon carte Pokémon GBA.
 * Forêt avec sentier en L (on sort de l'immeuble à droite puis le sentier
 * longe le balcon), balcon en béton, trois pièces, salle de bain, couloir
 * intérieur et palier d'immeuble à moquette noire. Entièrement statique
 * (memo) — les avatars et surbrillances vivent au-dessus.
 */

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
  runner: string;
  runnerEdge: string;
  carpet: string;
  carpetLine: string;
  doormat: string;
  tile: string;
  tileAlt: string;
  tub: string;
  water: string;
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
  runner: '#A83838',
  runnerEdge: '#8A2E2E',
  carpet: '#2E2E36',
  carpetLine: '#3A3A44',
  doormat: '#8A6030',
  tile: '#CFE8EC',
  tileAlt: '#BEDDE2',
  tub: '#F4F4F0',
  water: '#7EC8E0',
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
  runner: '#6E2626',
  runnerEdge: '#571E1E',
  carpet: '#212129',
  carpetLine: '#2B2B35',
  doormat: '#5E401E',
  tile: '#5E7880',
  tileAlt: '#526A72',
  tub: '#B8BCB4',
  water: '#4E90A8',
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
const TRAIL_Y = 92;
const TRAIL_H = 30;
const TRAIL_STUB_X = 288;
const TRAIL_STUB_W = 30;

export const HouseMap = memo(function HouseMap({ night }: { night: boolean }) {
  const p = night ? NIGHT : DAY;
  const houseTop = BALCONY_BOTTOM;
  const B = ZONES.bureau;
  const S = ZONES.sdb;
  const C = ZONES.chambre;
  const L = ZONES.salon;
  const CI = ZONES.couloir_int;
  const CE = ZONES.couloir_ext;

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
      {/* Rangée d'arbres au-dessus du sentier */}
      <Tree x={16} y={30} p={p} />
      <Tree x={72} y={22} p={p} />
      <Tree x={128} y={32} p={p} />
      <Tree x={186} y={20} p={p} />
      <Tree x={242} y={30} p={p} />
      <Tree x={306} y={24} p={p} />
      {/* Rangée d'arbres en dessous du sentier */}
      <Tree x={28} y={128} p={p} />
      <Tree x={92} y={132} p={p} />
      <Tree x={158} y={128} p={p} />
      <Tree x={224} y={132} p={p} />
      {/* Fleurs */}
      <Flower x={60} y={74} color={p.flower1} />
      <Flower x={150} y={68} color={p.flower2} />
      <Flower x={262} y={72} color={p.flower1} />
      <Flower x={70} y={162} color={p.flower2} />
      <Flower x={200} y={166} color={p.flower1} />
      <Flower x={330} y={140} color={p.flower2} />

      {/* ---------------- Balcon (béton) ---------------- */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={MAP_W} height={BALCONY_BOTTOM - OUTSIDE_BOTTOM} fill={p.concrete} />
      {/* Joints des dalles */}
      {[0, 1].map((i) => (
        <Line
          key={`cj${i}`}
          x1={0}
          y1={OUTSIDE_BOTTOM + 22 + i * 20}
          x2={MAP_W}
          y2={OUTSIDE_BOTTOM + 22 + i * 20}
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
          y2={BALCONY_BOTTOM}
          stroke={p.concreteLine}
          strokeWidth={2}
        />
      ))}
      {/* Rambarde côté forêt, portillon aligné sur le sentier */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={TRAIL_STUB_X - 2} height={6} fill={p.railing} />
      <Rect x={TRAIL_STUB_X + TRAIL_STUB_W + 2} y={OUTSIDE_BOTTOM} width={MAP_W - TRAIL_STUB_X - TRAIL_STUB_W - 2} height={6} fill={p.railing} />
      {Array.from({ length: 15 }).map((_, i) => {
        const x = 4 + i * 24;
        if (x > TRAIL_STUB_X - 8 && x < TRAIL_STUB_X + TRAIL_STUB_W + 4) return null;
        return <Rect key={`post${i}`} x={x} y={OUTSIDE_BOTTOM + 6} width={5} height={8} fill={p.railing} />;
      })}

      {/* ---------------- Sols de l'appartement ---------------- */}
      <Rect x={B.x} y={B.y} width={B.w} height={B.h} fill={p.floorBureau} />
      <Rect x={S.x} y={S.y} width={S.w} height={S.h} fill={p.tile} />
      <Rect x={C.x} y={C.y} width={C.w} height={C.h} fill={p.floorChambre} />
      <Rect x={L.x} y={L.y} width={L.w} height={L.h} fill={p.floorSalon} />
      <Rect x={CI.x} y={CI.y} width={CI.w} height={CI.h} fill={p.floorCouloir} />
      <Rect x={CE.x} y={CE.y} width={CE.w} height={CE.h} fill={p.carpet} />

      {/* Parquet du bureau */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Line
          key={`pq${i}`}
          x1={16 + i * 16}
          y1={B.y}
          x2={16 + i * 16}
          y2={B.y + B.h}
          stroke={p.floorBureauLine}
          strokeWidth={1.5}
        />
      ))}
      {/* Carrelage damier de la salle de bain */}
      {Array.from({ length: 5 }).map((_, col) =>
        Array.from({ length: 7 }).map((_, row) =>
          (col + row) % 2 === 0 ? (
            <Rect
              key={`t${col}-${row}`}
              x={S.x + col * 20}
              y={S.y + row * 20}
              width={20}
              height={Math.min(20, S.y + S.h - (S.y + row * 20))}
              fill={p.tileAlt}
            />
          ) : null
        )
      )}
      {/* Moquette noire du palier : trame discrète */}
      {[0, 1].map((i) => (
        <Line
          key={`ca${i}`}
          x1={0}
          y1={CE.y + 24 + i * 22}
          x2={MAP_W}
          y2={CE.y + 24 + i * 22}
          stroke={p.carpetLine}
          strokeWidth={2}
        />
      ))}

      {/* ---------------- Meubles ---------------- */}
      {/* Bureau : bureau + écran + chaise */}
      <Rect x={10} y={B.y + 22} width={72} height={22} fill={p.wood} />
      <Rect x={28} y={B.y + 8} width={24} height={16} fill={p.screen} />
      <Rect x={28} y={B.y + 8} width={24} height={4} fill={p.wall} />
      <Rect x={34} y={B.y + 50} width={20} height={16} fill={p.railing} />

      {/* Salle de bain : baignoire + lavabo */}
      <Rect x={S.x + 8} y={S.y + 12} width={38} height={76} fill={p.tub} />
      <Rect x={S.x + 13} y={S.y + 18} width={28} height={64} fill={p.water} />
      <Rect x={S.x + 70} y={S.y + 16} width={22} height={16} fill={p.tub} />

      {/* Chambre : lit + tapis */}
      <Rect x={C.x + 12} y={C.y + 16} width={52} height={70} fill={p.wood} />
      <Rect x={C.x + 16} y={C.y + 20} width={44} height={62} fill={p.mattress} />
      <Rect x={C.x + 20} y={C.y + 24} width={36} height={14} fill={p.pillow} />
      <Rect x={C.x + 16} y={C.y + 44} width={44} height={38} fill={p.blanket} />
      <Rect x={C.x + 16} y={C.y + 44} width={44} height={5} fill={p.pillow} />
      <Rect x={C.x + 96} y={C.y + 36} width={26} height={22} fill={p.rug} />

      {/* Salon : canapé + tapis + télé */}
      <Rect x={L.x + 12} y={L.y + 12} width={106} height={16} fill={p.sofaDark} />
      <Rect x={L.x + 12} y={L.y + 24} width={106} height={16} fill={p.sofa} />
      <Rect x={L.x + 16} y={L.y + 26} width={28} height={12} fill={p.sofaDark} />
      <Rect x={L.x + 50} y={L.y + 26} width={28} height={12} fill={p.sofaDark} />
      <Rect x={L.x + 84} y={L.y + 26} width={28} height={12} fill={p.sofaDark} />
      <Rect x={L.x + 14} y={L.y + 120} width={102} height={56} fill={p.rugEdge} />
      <Rect x={L.x + 18} y={L.y + 124} width={94} height={48} fill={p.rug} />
      <Rect x={L.x + 60} y={L.y + L.h - 22} width={50} height={14} fill={p.wall} />
      <Rect x={L.x + 64} y={L.y + L.h - 19} width={42} height={8} fill={p.screen} />

      {/* Couloir intérieur : tapis de couloir */}
      <Rect x={CI.x + 18} y={CI.y + 24} width={CI.w - 44} height={32} fill={p.runnerEdge} />
      <Rect x={CI.x + 22} y={CI.y + 28} width={CI.w - 52} height={24} fill={p.runner} />

      {/* Palier : paillasson devant la porte d'entrée */}
      <Rect x={306} y={CE.y + 6} width={40} height={16} fill={p.doormat} />

      {/* ---------------- Murs ---------------- */}
      {/* Façade côté balcon, avec baie vitrée (chambre) et fenêtres */}
      <Rect x={0} y={houseTop} width={140} height={7} fill={p.wall} />
      <Rect x={196} y={houseTop} width={164} height={7} fill={p.wall} />
      <Rect x={40} y={houseTop - 1} width={36} height={8} fill={p.window} />
      <Rect x={266} y={houseTop - 1} width={36} height={8} fill={p.window} />

      {/* Colonne bureau/sdb : cloison verticale x=100 (portes vers chambre/couloir) */}
      <Rect x={B.w - 2} y={houseTop} width={4} height={120} fill={p.wall} />
      <Rect x={B.w - 2} y={houseTop + 160} width={4} height={CI.y + CI.h - houseTop - 160} fill={p.wall} />
      {/* Séparation bureau / sdb (porte côté est) */}
      <Rect x={0} y={S.y - 2} width={30} height={4} fill={p.wall} />
      <Rect x={70} y={S.y - 2} width={30} height={4} fill={p.wall} />

      {/* Cloison chambre / salon (porte en bas) */}
      <Rect x={C.x + C.w - 2} y={houseTop} width={4} height={170} fill={p.wall} />
      <Rect x={C.x + C.w - 2} y={houseTop + 210} width={4} height={C.h - 210} fill={p.wall} />

      {/* Chambre & salon / couloir intérieur (une porte par pièce) */}
      <Rect x={CI.x} y={CI.y - 2} width={40} height={4} fill={p.wall} />
      <Rect x={CI.x + 80} y={CI.y - 2} width={110} height={4} fill={p.wall} />
      <Rect x={CI.x + 230} y={CI.y - 2} width={30} height={4} fill={p.wall} />

      {/* Mur de l'appartement vs palier, avec porte d'entrée (paillasson) */}
      <Rect x={0} y={CE.y - 3} width={308} height={6} fill={p.wall} />
      <Rect x={348} y={CE.y - 3} width={12} height={6} fill={p.wall} />

      {/* Murs extérieurs */}
      <Rect x={0} y={houseTop} width={4} height={MAP_H - houseTop} fill={p.wall} />
      <Rect x={MAP_W - 4} y={houseTop} width={4} height={MAP_H - houseTop} fill={p.wall} />
      <Rect x={0} y={MAP_H - 4} width={MAP_W} height={4} fill={p.wall} />
    </Svg>
  );
});
