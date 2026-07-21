import { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { MAP_H, MAP_W, type Spot } from '@/lib/house';

/**
 * Petits points très discrets sur les points aimantés du plan, affichés
 * pendant un drag. La liste dépend de ce qu'on déplace : tous les points
 * pour un avatar (extérieur compris), les points intérieurs autorisés
 * pour le tapis et le panier.
 */
export const GridDots = memo(function GridDots({ night, spots }: { night: boolean; spots: Spot[] }) {
  const fill = night ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
        {spots.map((s) => (
          <Circle key={`${s.x},${s.y}`} cx={s.x} cy={s.y} r={2} fill={fill} />
        ))}
      </Svg>
    </Animated.View>
  );
});
