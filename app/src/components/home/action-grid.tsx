import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CUES_DAILY_GOAL } from '@/components/home/cues-modal';
import { OVERALL_DAILY_GOAL } from '@/components/home/overall-modal';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * L'écran d'accueil comme outil de travail : le bouton SOLO (lancement
 * instantané d'une session de solitude) et les six actions du quotidien,
 * dans l'espace vert au-dessus de la forêt.
 */
/** Objectif quotidien de solitude (minutes) — codé en dur pour l'instant. */
export const SOLO_DAILY_GOAL_MINUTES = 15;

export function ActionGrid({
  onSolo,
  onFeed,
  onSortie,
  onDodo,
  onCues,
  onOverall,
  onGarde,
  todayCues,
  todayOveralls,
  todaySoloMinutes,
}: {
  onSolo: () => void;
  onFeed: () => void;
  onSortie: () => void;
  onDodo: () => void;
  onCues: () => void;
  onOverall: () => void;
  onGarde: () => void;
  todayCues: number;
  todayOveralls: number;
  /** Minutes de solitude cumulées aujourd'hui (objectif 15 min/j). */
  todaySoloMinutes: number;
}) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.grid}>
      <View style={styles.row}>
        <ActionButton emoji="🍖" label="NOURRITURE" onPress={onFeed} />
        <ActionButton emoji="🚶" label="SORTIE" onPress={onSortie} />
        <ActionButton emoji="🌙" label="DODO" onPress={onDodo} />
        <ActionButton emoji="🤝" label="GARDE" onPress={onGarde} />
      </View>
      <View style={styles.row}>
        <ActionButton
          emoji="🔑"
          label="FAUX SIGNAUX"
          badge={`${todayCues}/${CUES_DAILY_GOAL}`}
          badgeDone={todayCues >= CUES_DAILY_GOAL}
          onPress={onCues}
        />
        <ActionButton
          emoji="🐾"
          label="OVERALL"
          badge={`${todayOveralls}/${OVERALL_DAILY_GOAL}`}
          badgeDone={todayOveralls >= OVERALL_DAILY_GOAL}
          onPress={onOverall}
        />
        <ActionButton
          emoji="🚪"
          label="SOLO"
          badge={`${todaySoloMinutes}/${SOLO_DAILY_GOAL_MINUTES} MIN`}
          badgeDone={todaySoloMinutes >= SOLO_DAILY_GOAL_MINUTES}
          onPress={onSolo}
        />
      </View>
    </Animated.View>
  );
}

function ActionButton({
  emoji,
  label,
  badge,
  badgeDone,
  onPress,
}: {
  emoji: string;
  label: string;
  badge?: string;
  badgeDone?: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          boxShadow: pressed ? 'none' : `3px 3px 0px 0px ${colors.border}`,
          transform: pressed ? [{ translateX: 2 }, { translateY: 2 }] : [],
        },
      ]}>
      <Text style={styles.buttonEmoji}>{emoji}</Text>
      <Text style={[styles.buttonText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
      {badge ? (
        <Text style={[styles.badge, { color: badgeDone ? colors.success : colors.textSecondary }]}>
          {badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 3,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  buttonEmoji: {
    fontSize: 17,
  },
  buttonText: {
    fontSize: 6.5,
  },
  badge: {
    fontSize: 6.5,
  },
});
