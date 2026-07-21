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

import {
  FLAT_BOTTOM,
  MAP_W,
  OUTSIDE_BOTTOM,
  UBUNTU_MAT_H,
  UBUNTU_MAT_SPOT,
  UBUNTU_MAT_W,
} from '@/lib/house';

/** Même ressort sec que les avatars. */
const SPRING = { damping: 32, stiffness: 900, overshootClamping: true };

/**
 * Le petit tapis gris d'Ubuntu. Au repos il vit à sa place, au-dessus du
 * canapé. En mode placement (session Overall), il clignote comme un objet
 * à saisir et se laisse glisser n'importe où dans l'appartement ; au
 * lâcher, la position finale est remontée au parent (variable de
 * généralisation du protocole). Hors placement, il ressort vers sa place.
 */
export function UbuntuMat({
  scale,
  night,
  placing,
  onPlaced,
}: {
  scale: number;
  night: boolean;
  /** Mode placement Overall : clignote et devient draggable. */
  placing: boolean;
  /** Lâcher du tapis — coordonnées carte (la zone se calcule côté parent). */
  onPlaced: (x: number, y: number) => void;
}) {
  const x = useSharedValue(UBUNTU_MAT_SPOT.x);
  const y = useSharedValue(UBUNTU_MAT_SPOT.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const blink = useSharedValue(1);

  // Clignotement en mode placement ; retour à la maison quand il s'arrête.
  useEffect(() => {
    if (placing) {
      blink.value = withRepeat(
        withTiming(0.35, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
      return;
    }
    cancelAnimation(blink);
    blink.value = withTiming(1, { duration: 150 });
    x.value = withSpring(UBUNTU_MAT_SPOT.x, SPRING);
    y.value = withSpring(UBUNTU_MAT_SPOT.y, SPRING);
  }, [placing, blink, x, y]);

  const pan = Gesture.Pan()
    .enabled(placing)
    .minDistance(4)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      // Libre partout dans l'appartement et sur le balcon (pas dehors ni
      // sur le palier : la session Overall se joue à la maison).
      x.value = Math.min(
        Math.max(startX.value + e.translationX / scale, UBUNTU_MAT_W / 2),
        MAP_W - UBUNTU_MAT_W / 2
      );
      y.value = Math.min(
        Math.max(startY.value + e.translationY / scale, OUTSIDE_BOTTOM + UBUNTU_MAT_H / 2),
        FLAT_BOTTOM - UBUNTU_MAT_H / 2
      );
    })
    .onEnd(() => {
      runOnJS(onPlaced)(x.value, y.value);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value * scale - (UBUNTU_MAT_W * scale) / 2 },
      { translateY: y.value * scale - (UBUNTU_MAT_H * scale) / 2 },
    ],
    opacity: blink.value,
  }));

  const outer = night ? '#55555E' : '#A8A8B0';
  const inner = night ? '#6E6E78' : '#C6C6CC';

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.mat,
          {
            width: UBUNTU_MAT_W * scale,
            height: UBUNTU_MAT_H * scale,
            backgroundColor: outer,
            padding: 2 * scale,
          },
          animatedStyle,
        ]}>
        <View style={[styles.inner, { backgroundColor: inner }]} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  mat: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 2,
    zIndex: 5,
  },
  inner: {
    flex: 1,
    borderRadius: 1,
  },
});
