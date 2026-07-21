/* eslint-disable react-hooks/immutability -- les écritures de shared values
   Reanimated (.value) dans les worklets de geste sont le fonctionnement normal
   de la lib ; le React Compiler saute déjà ce composant. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import {
  BASKET_H,
  BASKET_W,
  FURNITURE_SPOTS,
  MAP_H,
  MAP_W,
  UBUNTU_MAT_H,
  UBUNTU_MAT_W,
  type Spot,
} from '@/lib/house';

/** Même ressort sec que les avatars. */
const SPRING = { damping: 32, stiffness: 900, overshootClamping: true };

/** Rayon (au carré) sous lequel un point est occupé par l'autre objet. */
const OCCUPIED_R2 = 10 * 10;

export type MapObjectKind = 'mat' | 'basket';

const SIZES: Record<MapObjectKind, { w: number; h: number }> = {
  mat: { w: UBUNTU_MAT_W, h: UBUNTU_MAT_H },
  basket: { w: BASKET_W, h: BASKET_H },
};

/**
 * Panier d'Ubuntu en pixel-art : corbeille ronde vue de dessus, rebord
 * bleu épais à reflets, intérieur noir ombré. 1 caractère = 1 unité carte.
 */
const BASKET_GRID = [
  '......KKKKKKKKKK......',
  '....KKBBBDBBDBBBKK....',
  '...KBBbBBBBBBBBbBBK...',
  '..KBbBBDBBBBBBDBBbBK..',
  '.KBbBBNNNNNNNNNNBBbBK.',
  '.KBBDNnnnnnnnnnnNDBBK.',
  'KBbBNnNNNNNNNNNNnNBbBK',
  'KBBBNnNNNNNNNNNNnNBBBK',
  'KBDBNnNNNNNNNNNNnNBDBK',
  'KBBBNnNNNNNNNNNNnNBBBK',
  'KBbBNnnNNNNNNNNnnNBbBK',
  '.KBBDNNnnnnnnnnNNDBBK.',
  '..KBbBBNNNNNNNNBBbBK..',
  '...KBBbBBDBBDBBbBBK...',
  '....KKBBBBBBBBBBKK....',
  '......KKKKKKKKKK......',
];

const BASKET_DAY: Record<string, string> = {
  K: '#1C2A4A',
  B: '#3868C8',
  b: '#6E9AE8',
  D: '#2A4E9A',
  N: '#16161C',
  n: '#2C2C36',
};

const BASKET_NIGHT: Record<string, string> = {
  K: '#101A30',
  B: '#2A4E96',
  b: '#4A6EB0',
  D: '#1E3A72',
  N: '#0C0C12',
  n: '#20202A',
};

export function BasketSprite({ night }: { night: boolean }) {
  const colors = night ? BASKET_NIGHT : BASKET_DAY;
  const px: React.ReactElement[] = [];
  BASKET_GRID.forEach((row, j) => {
    let start = -1;
    for (let i = 0; i <= row.length; i++) {
      const c = i < row.length ? row[i] : '.';
      if (start >= 0 && (c === '.' || c !== row[start])) {
        px.push(
          <Rect
            key={`${start}-${j}`}
            x={start}
            y={j}
            width={i - start}
            height={1.06}
            fill={colors[row[start]]}
          />
        );
        start = -1;
      }
      if (start < 0 && c !== '.') start = i;
    }
  });
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${BASKET_GRID[0].length} ${BASKET_GRID.length}`}>
      {px}
    </Svg>
  );
}

/**
 * Un objet déplaçable du plan (tapis gris, panier bleu). Toujours
 * draggable, comme les avatars, mais uniquement vers les points
 * INTÉRIEURS (jamais dehors ni sur le palier, jamais sur le tapis du
 * bureau, le lit ou le canapé), et jamais sur le point de l'autre objet.
 * Toujours SOUS les personnages (zIndex < avatars). La position est
 * contrôlée par le parent (persistance + realtime).
 */
export function MapObject({
  kind,
  pos,
  otherPos,
  scale,
  night,
  blinking = false,
  onDragChange,
  onDropped,
}: {
  kind: MapObjectKind;
  /** Position courante (centre, unités carte) — contrôlée par le parent. */
  pos: Spot;
  /** Position de l'autre objet (son point reste interdit). */
  otherPos: Spot;
  scale: number;
  night: boolean;
  /** Clignote (placement Overall, repositionnement du panier). */
  blinking?: boolean;
  onDragChange?: (dragging: boolean) => void;
  onDropped: (x: number, y: number) => void;
}) {
  const { w, h } = SIZES[kind];
  const x = useSharedValue(pos.x);
  const y = useSharedValue(pos.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const blink = useSharedValue(1);

  // Position contrôlée : ressort vers la valeur du parent (fetch, realtime,
  // lâcher validé) — sauf pendant un drag local.
  useEffect(() => {
    if (dragging.value) return;
    x.value = withSpring(pos.x, SPRING);
    y.value = withSpring(pos.y, SPRING);
  }, [pos.x, pos.y, x, y, dragging]);

  useEffect(() => {
    if (blinking) {
      blink.value = withRepeat(
        withTiming(0.35, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
      return;
    }
    cancelAnimation(blink);
    blink.value = withTiming(1, { duration: 150 });
  }, [blinking, blink]);

  const pan = Gesture.Pan()
    .minDistance(4)
    .onStart(() => {
      dragging.value = true;
      startX.value = x.value;
      startY.value = y.value;
      if (onDragChange) runOnJS(onDragChange)(true);
    })
    .onUpdate((e) => {
      x.value = Math.min(Math.max(startX.value + e.translationX / scale, w / 2), MAP_W - w / 2);
      y.value = Math.min(Math.max(startY.value + e.translationY / scale, h / 2), MAP_H - h / 2);
    })
    .onEnd(() => {
      // Point intérieur libre (pas celui de l'autre objet) le plus proche.
      let best: Spot | null = null;
      let bestD = Number.MAX_VALUE;
      for (const s of FURNITURE_SPOTS) {
        const dOther =
          (s.x - otherPos.x) * (s.x - otherPos.x) + (s.y - otherPos.y) * (s.y - otherPos.y);
        if (dOther < OCCUPIED_R2) continue;
        const d = (s.x - x.value) * (s.x - x.value) + (s.y - y.value) * (s.y - y.value);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best) {
        x.value = withSpring(best.x, SPRING);
        y.value = withSpring(best.y, SPRING);
        runOnJS(onDropped)(best.x, best.y);
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      if (onDragChange) runOnJS(onDragChange)(false);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value * scale - (w * scale) / 2 },
      { translateY: y.value * scale - (h * scale) / 2 },
      { scale: withTiming(dragging.value ? 1.15 : 1, { duration: 120 }) },
    ],
    opacity: blink.value,
    zIndex: dragging.value ? 8 : kind === 'mat' ? 5 : 6,
  }));

  const matOuter = night ? '#55555E' : '#A8A8B0';
  const matInner = night ? '#6E6E78' : '#C6C6CC';

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.object, { width: w * scale, height: h * scale }, animatedStyle]}>
        {kind === 'mat' ? (
          <View style={[styles.mat, { backgroundColor: matOuter, padding: 2 * scale }]}>
            <View style={[styles.matInner, { backgroundColor: matInner }]} />
          </View>
        ) : (
          <BasketSprite night={night} />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  object: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  mat: {
    flex: 1,
    borderRadius: 2,
  },
  matInner: {
    flex: 1,
    borderRadius: 1,
  },
});
