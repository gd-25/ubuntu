import { memo } from 'react';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { BALCONY_BOTTOM, MAP_H, MAP_W, OUTSIDE_BOTTOM } from '@/lib/house';

/**
 * Le plan de la maison en pixel-art SVG, façon carte Pokémon GBA :
 * forêt en haut, balcon, puis les trois pièces. Entièrement statique
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
  plank: string;
  plankLine: string;
  railing: string;
  wall: string;
  floorBureau: string;
  floorBureauLine: string;
  floorChambre: string;
  floorSalon: string;
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
  plank: '#C08850',
  plankLine: '#A06838',
  railing: '#8A5830',
  wall: '#584050',
  floorBureau: '#C8B088',
  floorBureauLine: '#B89868',
  floorChambre: '#E0C8A0',
  floorSalon: '#D0A878',
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
  plank: '#7A5638',
  plankLine: '#5E4028',
  railing: '#52381E',
  wall: '#2E2436',
  floorBureau: '#786650',
  floorBureauLine: '#685846',
  floorChambre: '#887250',
  floorSalon: '#7A6248',
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

export const HouseMap = memo(function HouseMap({ night }: { night: boolean }) {
  const p = night ? NIGHT : DAY;
  const houseTop = BALCONY_BOTTOM;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
      {/* ---------------- Dehors : clairière + forêt ---------------- */}
      <Rect x={0} y={0} width={MAP_W} height={OUTSIDE_BOTTOM} fill={p.grass} />
      {/* Damier d'herbe */}
      {Array.from({ length: 9 }).map((_, col) =>
        Array.from({ length: 6 }).map((_, row) =>
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
      {/* Chemin de terre vers la maison */}
      <Rect x={168} y={40} width={24} height={OUTSIDE_BOTTOM - 40} fill={p.path} />
      <Rect x={168} y={40} width={3} height={OUTSIDE_BOTTOM - 40} fill={p.pathEdge} />
      <Rect x={189} y={40} width={3} height={OUTSIDE_BOTTOM - 40} fill={p.pathEdge} />
      {/* Forêt */}
      <Tree x={6} y={2} p={p} />
      <Tree x={40} y={14} p={p} />
      <Tree x={86} y={0} p={p} />
      <Tree x={126} y={16} p={p} />
      <Tree x={210} y={10} p={p} />
      <Tree x={252} y={0} p={p} />
      <Tree x={296} y={14} p={p} />
      <Tree x={328} y={2} p={p} />
      <Tree x={6} y={96} p={p} />
      <Tree x={324} y={100} p={p} />
      <Tree x={44} y={150} p={p} />
      <Tree x={290} y={154} p={p} />
      <Tree x={6} y={172} p={p} />
      <Tree x={326} y={176} p={p} />
      {/* Fleurs */}
      <Flower x={70} y={70} color={p.flower1} />
      <Flower x={112} y={104} color={p.flower2} />
      <Flower x={230} y={78} color={p.flower2} />
      <Flower x={288} y={64} color={p.flower1} />
      <Flower x={52} y={126} color={p.flower2} />
      <Flower x={130} y={158} color={p.flower1} />
      <Flower x={238} y={166} color={p.flower2} />

      {/* ---------------- Balcon ---------------- */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={MAP_W} height={BALCONY_BOTTOM - OUTSIDE_BOTTOM} fill={p.plank} />
      {[0, 1, 2, 3].map((i) => (
        <Line
          key={`pl${i}`}
          x1={0}
          y1={OUTSIDE_BOTTOM + 14 + i * 14}
          x2={MAP_W}
          y2={OUTSIDE_BOTTOM + 14 + i * 14}
          stroke={p.plankLine}
          strokeWidth={2}
        />
      ))}
      {/* Rambarde côté forêt (avec un portillon au niveau du chemin) */}
      <Rect x={0} y={OUTSIDE_BOTTOM} width={166} height={6} fill={p.railing} />
      <Rect x={194} y={OUTSIDE_BOTTOM} width={166} height={6} fill={p.railing} />
      {Array.from({ length: 15 }).map((_, i) => {
        const x = 4 + i * 24;
        if (x > 160 && x < 194) return null;
        return <Rect key={`post${i}`} x={x} y={OUTSIDE_BOTTOM + 6} width={5} height={8} fill={p.railing} />;
      })}

      {/* ---------------- Maison ---------------- */}
      {/* Sols */}
      <Rect x={0} y={houseTop} width={120} height={MAP_H - houseTop} fill={p.floorBureau} />
      <Rect x={120} y={houseTop} width={120} height={MAP_H - houseTop} fill={p.floorChambre} />
      <Rect x={240} y={houseTop} width={120} height={MAP_H - houseTop} fill={p.floorSalon} />
      {/* Parquet du bureau */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <Line
          key={`pq${i}`}
          x1={16 + i * 16}
          y1={houseTop}
          x2={16 + i * 16}
          y2={MAP_H}
          stroke={p.floorBureauLine}
          strokeWidth={1.5}
        />
      ))}

      {/* Meubles — bureau */}
      <Rect x={12} y={houseTop + 26} width={64} height={24} fill={p.wood} />
      <Rect x={26} y={houseTop + 10} width={24} height={18} fill={p.screen} />
      <Rect x={26} y={houseTop + 10} width={24} height={4} fill={p.wall} />
      <Rect x={88} y={houseTop + 30} width={20} height={18} fill={p.railing} />

      {/* Meubles — chambre : lit */}
      <Rect x={134} y={houseTop + 16} width={52} height={70} fill={p.wood} />
      <Rect x={138} y={houseTop + 20} width={44} height={62} fill={p.mattress} />
      <Rect x={142} y={houseTop + 24} width={36} height={14} fill={p.pillow} />
      <Rect x={138} y={houseTop + 44} width={44} height={38} fill={p.blanket} />
      <Rect x={138} y={houseTop + 44} width={44} height={5} fill={p.pillow} />
      {/* Tapis de la chambre */}
      <Rect x={196} y={houseTop + 30} width={34} height={26} fill={p.rug} />

      {/* Meubles — salon : canapé + tapis + télé */}
      <Rect x={252} y={houseTop + 12} width={76} height={16} fill={p.sofaDark} />
      <Rect x={252} y={houseTop + 24} width={76} height={16} fill={p.sofa} />
      <Rect x={256} y={houseTop + 26} width={20} height={12} fill={p.sofaDark} />
      <Rect x={280} y={houseTop + 26} width={20} height={12} fill={p.sofaDark} />
      <Rect x={304} y={houseTop + 26} width={20} height={12} fill={p.sofaDark} />
      <Rect x={252} y={houseTop + 74} width={76} height={52} fill={p.rugEdge} />
      <Rect x={256} y={houseTop + 78} width={68} height={44} fill={p.rug} />
      <Rect x={296} y={MAP_H - 40} width={44} height={14} fill={p.wall} />
      <Rect x={300} y={MAP_H - 37} width={36} height={8} fill={p.screen} />

      {/* Cloisons intérieures (avec passage de porte) */}
      <Rect x={118} y={houseTop} width={4} height={220} fill={p.wall} />
      <Rect x={118} y={houseTop + 262} width={4} height={MAP_H - houseTop - 262} fill={p.wall} />
      <Rect x={238} y={houseTop} width={4} height={220} fill={p.wall} />
      <Rect x={238} y={houseTop + 262} width={4} height={MAP_H - houseTop - 262} fill={p.wall} />

      {/* Mur de façade (côté balcon) avec baie vitrée dans la chambre */}
      <Rect x={0} y={houseTop} width={150} height={7} fill={p.wall} />
      <Rect x={210} y={houseTop} width={150} height={7} fill={p.wall} />
      {/* Fenêtres */}
      <Rect x={40} y={houseTop - 1} width={36} height={8} fill={p.window} />
      <Rect x={272} y={houseTop - 1} width={36} height={8} fill={p.window} />

      {/* Murs extérieurs */}
      <Rect x={0} y={houseTop} width={4} height={MAP_H - houseTop} fill={p.wall} />
      <Rect x={MAP_W - 4} y={houseTop} width={4} height={MAP_H - houseTop} fill={p.wall} />
      <Rect x={0} y={MAP_H - 4} width={MAP_W} height={4} fill={p.wall} />
    </Svg>
  );
});
