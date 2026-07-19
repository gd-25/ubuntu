import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { MAP_H, MAP_W, WALKABLE_CELLS } from '@/lib/house';

/**
 * Petits points très discrets au centre de chaque case utilisable, affichés
 * pendant le drag d'un avatar. Chaque point est un aimant : l'avatar y est
 * doucement attiré et y reste au lâcher.
 */
export const GridDots = memo(function GridDots({ night }: { night: boolean }) {
  const fill = night ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
        {WALKABLE_CELLS.map((c) => (
          <Circle key={`${c.col},${c.row}`} cx={c.x} cy={c.y} r={1.7} fill={fill} />
        ))}
      </Svg>
    </Animated.View>
  );
});
