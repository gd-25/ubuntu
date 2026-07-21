/* eslint-disable react-hooks/immutability -- les écritures de shared values
   Reanimated (.value) dans les worklets de geste sont le fonctionnement normal
   de la lib ; le React Compiler saute déjà ce composant. */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  FLAT_BOTTOM,
  MAGNET_SPOTS,
  MAP_H,
  MAP_W,
  OUTSIDE_BOTTOM,
  SLOTS,
  ZONE_RECTS,
} from '@/lib/house';
import type { Person, Space } from '@/lib/types';

/** Aimant très sec : ~150 ms, quasi aucun dépassement de la cible. */
const SPRING = { damping: 32, stiffness: 900, overshootClamping: true };

/** Rayon (unités carte) dans lequel un point attire doucement l'avatar. */
const MAGNET_RADIUS = 15;
/** Force de l'aimant au centre du point (0 = rien, 1 = collé). */
const MAGNET_PULL = 0.55;
/** Rayon dans lequel « passer près d'un point » déclenche le haptic. */
const HAPTIC_RADIUS = 11;

/** Zone contenant le point (x, y) — version worklet de spaceAt. */
function zoneAt(x: number, y: number): Space {
  'worklet';
  for (const { space, rect } of ZONE_RECTS) {
    if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) return space;
  }
  return 'salon';
}

/** Petit tic haptique quand on passe près d'un point de la grille. */
function hapticTick() {
  Haptics.selectionAsync().catch(() => {});
}

/** Positions au repos de tous les avatars (partagées entre les sprites). */
export type AvatarSpots = Record<Person, { x: number; y: number }>;

/** Rayon (au carré) en-dessous duquel deux avatars sont « au même point ». */
const OCCUPIED_R2 = 10 * 10;

/** La case (cx, cy) est-elle libre (aucun AUTRE avatar posé dessus) ? */
function cellFree(spots: AvatarSpots, self: Person, cx: number, cy: number): boolean {
  'worklet';
  for (const p in spots) {
    if (p === self) continue;
    const o = spots[p as Person];
    if ((o.x - cx) * (o.x - cx) + (o.y - cy) * (o.y - cy) < OCCUPIED_R2) return false;
  }
  return true;
}

/** Point aimanté LIBRE le plus proche de (x, y), ou null si aucun. */
function nearestFreeSpot(
  spots: AvatarSpots,
  self: Person,
  x: number,
  y: number
): { x: number; y: number; d: number } | null {
  'worklet';
  let best: { x: number; y: number; d: number } | null = null;
  for (const s of MAGNET_SPOTS) {
    if (!cellFree(spots, self, s.x, s.y)) continue;
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (!best || d < best.d) best = { x: s.x, y: s.y, d };
  }
  return best;
}

/**
 * Un avatar déplaçable sur le plan. Les coordonnées internes sont en unités
 * carte, `scale` convertit vers les pixels écran. Pendant le drag, chaque
 * case utilisable a un point légèrement aimanté (tic haptique au passage) ;
 * au lâcher sur la grille, l'avatar reste sur le point le plus proche. Hors
 * grille (dehors, palier), il file vers l'ancrage de sa zone.
 */
export function AvatarSprite({
  person,
  source,
  space,
  scale,
  width,
  height,
  zIndex,
  spots,
  onDropped,
  onHoverSpace,
  onDragChange,
  onTap,
}: {
  person: Person;
  source: number;
  /** Zone actuelle (état synchronisé). */
  space: Space;
  scale: number;
  /** Taille affichée, en unités carte. */
  width: number;
  height: number;
  zIndex: number;
  /** Positions au repos de tous les avatars — évite deux avatars au même point. */
  spots: SharedValue<AvatarSpots>;
  onDropped: (person: Person, space: Space, x: number, y: number) => void;
  onHoverSpace: (space: Space | null) => void;
  onDragChange?: (dragging: boolean) => void;
  onTap?: () => void;
}) {
  const x = useSharedValue(SLOTS[space][person].x);
  const y = useSharedValue(SLOTS[space][person].y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const hover = useSharedValue<Space | ''>('');
  const nearCell = useSharedValue('');
  /** Zone du dernier lâcher sur un point : l'effet de zone ne doit pas
      re-aimanter vers l'ancrage (l'avatar reste sur son point). */
  const keepCellFor = useSharedValue<Space | ''>('');
  const bob = useSharedValue(0);

  // Respiration pixel : petit va-et-vient vertical permanent.
  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [bob]);

  // Changement de zone (local ou realtime) : ressort vers l'ancrage, sauf si
  // l'avatar vient d'être posé sur un point de cette zone.
  useEffect(() => {
    if (keepCellFor.value === space) {
      keepCellFor.value = '';
      return;
    }
    keepCellFor.value = '';
    const slot = SLOTS[space][person];
    x.value = withSpring(slot.x, SPRING);
    y.value = withSpring(slot.y, SPRING);
    spots.value = { ...spots.value, [person]: { x: slot.x, y: slot.y } };
  }, [space, person, x, y, keepCellFor, spots]);

  const pan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      dragging.value = true;
      startX.value = x.value;
      startY.value = y.value;
      hover.value = '';
      nearCell.value = '';
      if (onDragChange) runOnJS(onDragChange)(true);
    })
    .onUpdate((e) => {
      const nx = Math.min(Math.max(startX.value + e.translationX / scale, 14), MAP_W - 14);
      const ny = Math.min(Math.max(startY.value + e.translationY / scale, 20), MAP_H - 20);

      // Point aimanté libre le plus proche du doigt.
      const spot = nearestFreeSpot(spots.value, person, nx, ny);
      const d = spot ? Math.sqrt(spot.d) : Number.MAX_VALUE;
      if (spot && d < MAGNET_RADIUS) {
        // Aimant doux : plus on est près du point, plus il attire.
        const t = (1 - d / MAGNET_RADIUS) * MAGNET_PULL;
        x.value = nx + (spot.x - nx) * t;
        y.value = ny + (spot.y - ny) * t;
        const key = `${spot.x},${spot.y}`;
        if (d < HAPTIC_RADIUS && nearCell.value !== key) {
          nearCell.value = key;
          runOnJS(hapticTick)();
        }
      } else {
        x.value = nx;
        y.value = ny;
      }

      const zone = zoneAt(x.value, y.value);
      if (zone !== hover.value) {
        hover.value = zone;
        runOnJS(onHoverSpace)(zone);
      }
    })
    .onEnd(() => {
      // Lâcher sur la grille : l'avatar reste sur le point LIBRE le plus
      // proche (jamais deux avatars sur le même point).
      if (y.value >= OUTSIDE_BOTTOM && y.value < FLAT_BOTTOM) {
        const spot = nearestFreeSpot(spots.value, person, x.value, y.value);
        if (spot) {
          x.value = withSpring(spot.x, SPRING);
          y.value = withSpring(spot.y, SPRING);
          spots.value = { ...spots.value, [person]: { x: spot.x, y: spot.y } };
          const zone = zoneAt(spot.x, spot.y);
          keepCellFor.value = zone;
          runOnJS(onDropped)(person, zone, spot.x, spot.y);
          return;
        }
      }
      // Hors grille (dehors, palier) : aimant vers l'ancrage de la zone.
      const zone = zoneAt(x.value, y.value);
      const slot = SLOTS[zone][person];
      x.value = withSpring(slot.x, SPRING);
      y.value = withSpring(slot.y, SPRING);
      spots.value = { ...spots.value, [person]: { x: slot.x, y: slot.y } };
      runOnJS(onDropped)(person, zone, slot.x, slot.y);
    })
    .onFinalize(() => {
      dragging.value = false;
      hover.value = '';
      runOnJS(onHoverSpace)(null);
      if (onDragChange) runOnJS(onDragChange)(false);
    });

  const tap = Gesture.Tap()
    .maxDuration(300)
    .onEnd(() => {
      if (onTap) runOnJS(onTap)();
    });

  const gesture = onTap ? Gesture.Exclusive(pan, tap) : pan;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value * scale - (width * scale) / 2 },
      { translateY: y.value * scale - (height * scale) / 2 - bob.value * 2 },
      { scale: withTiming(dragging.value ? 1.18 : 1, { duration: 120 }) },
    ],
    zIndex: dragging.value ? 100 : zIndex,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.sprite,
          { width: width * scale, height: height * scale },
          animatedStyle,
        ]}>
        <Image source={source} style={styles.image} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  sprite: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
