import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import Svg, { G, Rect } from 'react-native-svg';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DepartureState, HumanLocation, Person } from '@/lib/types';

const STATES: { value: DepartureState; emoji: string; label: string }[] = [
  { value: 'asleep', emoji: '😴', label: 'ENDORMI' },
  { value: 'settled', emoji: '😌', label: 'POSÉ' },
  { value: 'active', emoji: '⚡', label: 'ACTIF' },
  { value: 'following', emoji: '👀', label: 'NOUS SUIVAIT' },
];

const LOCATIONS: { value: HumanLocation; label: string }[] = [
  { value: 'couloir', label: 'COULOIR' },
  { value: 'en_bas', label: 'EN BAS' },
  { value: 'dehors', label: 'DEHORS' },
];

/** Avatar de la personne qui utilise l'app (même sprites que le plan). */
const AVATARS: Record<Exclude<Person, 'ubuntu'>, { source: number; w: number; h: number }> = {
  greg: { source: require('../../../assets/images/avatars/greg.png'), w: 22, h: 30 },
  fiona: { source: require('../../../assets/images/avatars/fio.png'), w: 24, h: 32 },
};

/** Fond « en bas de l'immeuble » : herbe, sentier, deux sapins pixel sur
 * les côtés (l'avatar occupe le centre). `none` : rien n'est rogné, et les
 * aplats (herbe, sentier) supportent l'étirement sans se déformer. */
function DownstairsBackground() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 132 44" preserveAspectRatio="none">
      <Rect x={0} y={0} width={132} height={44} fill="#78C050" />
      <Rect x={0} y={0} width={66} height={22} fill="#86CC5E" />
      <Rect x={66} y={22} width={66} height={22} fill="#86CC5E" />
      {/* Sentier au sol */}
      <Rect x={0} y={28} width={132} height={12} fill="#D8B078" />
      <Rect x={0} y={28} width={132} height={1.5} fill="#BC9258" />
      <Rect x={0} y={38.5} width={132} height={1.5} fill="#BC9258" />
      {/* Deux sapins sur les côtés, au-dessus du sentier */}
      {[8, 110].map((x) => (
        <G key={`t${x}`}>
          <Rect x={x + 5} y={22} width={4} height={5} fill="#7A4A28" />
          <Rect x={x} y={16} width={14} height={7} fill="#2E6828" />
          <Rect x={x + 1} y={11} width={12} height={6} fill="#3E8834" />
          <Rect x={x + 3} y={7} width={8} height={5} fill="#54A448" />
        </G>
      ))}
    </Svg>
  );
}

/**
 * Mini-picker affiché juste après le tap SOLO : (1) l'état d'Ubuntu au
 * moment du départ (la variable la plus prédictive) et (2) où sera
 * l'humain pendant la session — l'avatar du compte sur trois fonds :
 * couloir gris, en bas (sentier et sapins), dehors (arc-en-ciel).
 * Le panneau se ferme tout seul quand les deux réponses sont données.
 */
export function SoloPicker({
  top,
  person,
  onPickState,
  onPickLocation,
  onDismiss,
}: {
  top: number;
  /** Avatar du compte connecté (greg ou fiona). */
  person: Exclude<Person, 'ubuntu'>;
  onPickState: (state: DepartureState) => void;
  onPickLocation: (location: HumanLocation) => void;
  onDismiss: () => void;
}) {
  const colors = useTheme();
  const [pickedState, setPickedState] = useState<DepartureState | null>(null);
  const [pickedLocation, setPickedLocation] = useState<HumanLocation | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatar = AVATARS[person];

  /** Ferme le panneau (un instant après) quand les deux réponses sont là. */
  const maybeClose = (state: DepartureState | null, location: HumanLocation | null) => {
    if (!state || !location || closeTimer.current) return;
    closeTimer.current = setTimeout(onDismiss, 350);
  };

  const pickState = (state: DepartureState) => {
    setPickedState(state);
    onPickState(state);
    maybeClose(state, pickedLocation);
  };

  const pickLocation = (location: HumanLocation) => {
    setPickedLocation(location);
    onPickLocation(location);
    maybeClose(pickedState, location);
  };

  return (
    <Animated.View
      entering={SlideInUp.duration(240)}
      exiting={SlideOutUp.duration(160)}
      style={[
        styles.panel,
        {
          top,
          backgroundColor: colors.card,
          borderColor: colors.border,
          boxShadow: `4px 4px 0px 0px ${colors.border}`,
        },
      ]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.accent }]}>IL ÉTAIT COMMENT AU DÉPART ?</Text>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text style={[styles.dismiss, { color: colors.textSecondary }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {STATES.map(({ value, emoji, label }) => (
          <Pressable
            key={value}
            onPress={() => pickState(value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: pickedState === value ? colors.accent : colors.background,
                borderColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <Text style={styles.optionEmoji}>{emoji}</Text>
            <Text
              style={[
                styles.optionText,
                { color: pickedState === value ? colors.accentText : colors.text },
              ]}
              numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.title, { color: colors.accent }]}>ET TOI, TU SERAS OÙ ?</Text>
      <View style={styles.row}>
        {LOCATIONS.map(({ value, label }) => (
          <Pressable
            key={value}
            onPress={() => pickLocation(value)}
            style={({ pressed }) => [
              styles.locationOption,
              {
                borderColor: pickedLocation === value ? colors.accent : colors.border,
                borderWidth: pickedLocation === value ? 3 : 2,
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <View style={styles.locationScene}>
              {value === 'couloir' ? (
                <View style={[StyleSheet.absoluteFill, styles.hallway]} />
              ) : value === 'en_bas' ? (
                <View style={StyleSheet.absoluteFill}>
                  <DownstairsBackground />
                </View>
              ) : (
                <LinearGradient
                  colors={['#E84848', '#E89840', '#E8D848', '#50B858', '#4890E0', '#9058C8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Image
                source={avatar.source}
                style={{ width: avatar.w, height: avatar.h }}
                contentFit="contain"
              />
            </View>
            <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    gap: Spacing.sm,
    zIndex: 130,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: 8,
    flexShrink: 1,
  },
  dismiss: {
    fontSize: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 9,
    paddingHorizontal: 2,
  },
  optionEmoji: {
    fontSize: 16,
  },
  optionText: {
    fontSize: 5.5,
  },
  locationOption: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: 2,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  locationScene: {
    alignSelf: 'stretch',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hallway: {
    backgroundColor: '#55555E',
  },
});
