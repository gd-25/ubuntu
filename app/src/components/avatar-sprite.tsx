/* eslint-disable react-hooks/immutability -- les écritures de shared values
   Reanimated (.value) dans les worklets de geste sont le fonctionnement normal
   de la lib ; le React Compiler saute déjà ce composant. */
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
} from 'react-native-reanimated';

import { MAP_H, MAP_W, SLOTS, ZONES } from '@/lib/house';
import type { Person, Space } from '@/lib/types';

/** Ressort sec : l'aimant claque en ~250 ms avec un seul petit rebond. */
const SPRING = { damping: 20, stiffness: 320 };

const SPACES = Object.keys(ZONES) as Space[];

/** Zone contenant le point (x, y) — version worklet de spaceAt. */
function zoneAt(x: number, y: number): Space {
  'worklet';
  for (const space of SPACES) {
    const r = ZONES[space];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return space;
  }
  return 'salon';
}

/**
 * Un avatar déplaçable sur le plan. Les coordonnées internes sont en unités
 * carte (360×460) ; `scale` convertit vers les pixels écran. L'aimant :
 * au lâcher, l'avatar file vers l'ancrage de sa zone avec un ressort.
 */
export function AvatarSprite({
  person,
  source,
  space,
  scale,
  width,
  height,
  zIndex,
  onDropped,
  onHoverSpace,
  onTap,
}: {
  person: Person;
  source: number;
  /** Zone actuelle (état synchronisé) — l'avatar est aimanté sur son ancrage. */
  space: Space;
  scale: number;
  /** Taille affichée, en unités carte. */
  width: number;
  height: number;
  zIndex: number;
  onDropped: (person: Person, space: Space) => void;
  onHoverSpace: (space: Space | null) => void;
  onTap?: () => void;
}) {
  const x = useSharedValue(SLOTS[space][person].x);
  const y = useSharedValue(SLOTS[space][person].y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const hover = useSharedValue<Space | ''>('');
  const bob = useSharedValue(0);

  // Respiration pixel : petit va-et-vient vertical permanent.
  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [bob]);

  // Aimant : à chaque changement de zone (local ou realtime), ressort vers l'ancrage.
  useEffect(() => {
    const slot = SLOTS[space][person];
    x.value = withSpring(slot.x, SPRING);
    y.value = withSpring(slot.y, SPRING);
  }, [space, person, x, y]);

  const pan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      dragging.value = true;
      startX.value = x.value;
      startY.value = y.value;
      hover.value = '';
    })
    .onUpdate((e) => {
      const nx = startX.value + e.translationX / scale;
      const ny = startY.value + e.translationY / scale;
      x.value = Math.min(Math.max(nx, 14), MAP_W - 14);
      y.value = Math.min(Math.max(ny, 20), MAP_H - 20);
      const zone = zoneAt(x.value, y.value);
      if (zone !== hover.value) {
        hover.value = zone;
        runOnJS(onHoverSpace)(zone);
      }
    })
    .onEnd(() => {
      const zone = zoneAt(x.value, y.value);
      // Aimant immédiat (même zone → l'effet React ne re-déclenchera pas).
      x.value = withSpring(SLOTS[zone][person].x, SPRING);
      y.value = withSpring(SLOTS[zone][person].y, SPRING);
      runOnJS(onDropped)(person, zone);
    })
    .onFinalize(() => {
      dragging.value = false;
      hover.value = '';
      runOnJS(onHoverSpace)(null);
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
