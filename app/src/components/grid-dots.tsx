import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { MAGNET_SPOTS, MAP_H, MAP_W } from '@/lib/house';

/**
 * Petits points très discrets sur chaque point aimanté du plan (une case
 * sur deux + places spéciales : tapis, canapé, lit), affichés pendant le
 * drag d'un avatar. Chaque point est un aimant : l'avatar y est doucement
 * attiré et y reste au lâcher.
 */
export const GridDots = memo(function GridDots({ night }: { night: boolean }) {
  const fill = night ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
        {MAGNET_SPOTS.map((s) => (
          <Circle key={`${s.x},${s.y}`} cx={s.x} cy={s.y} r={2} fill={fill} />
        ))}
      </Svg>
    </Animated.View>
  );
});
