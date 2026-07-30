import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ReactNode } from 'react';
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

/** Avatars famille (mêmes sprites que le plan). */
const AVATARS: Record<Exclude<Person, 'ubuntu'>, { source: number; w: number; h: number }> = {
  greg: { source: require('../../../assets/images/avatars/greg.png'), w: 22, h: 30 },
  fiona: { source: require('../../../assets/images/avatars/fio.png'), w: 24, h: 32 },
};

export type Participant = Exclude<Person, 'ubuntu'>;

const PARTICIPANTS: { value: Participant; label: string }[] = [
  { value: 'fiona', label: 'FIONA' },
  { value: 'greg', label: 'GREG' },
];

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
 * Case commune aux trois sections : un visuel de hauteur FIXE (emoji,
 * avatar ou scène) au-dessus d'un libellé — toutes les cases ont la même
 * hauteur et la même structure. Sélection : bordure accent épaisse.
 */
function PickOption({
  visual,
  label,
  selected,
  onPress,
}: {
  visual: ReactNode;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? colors.accent : colors.border,
          borderWidth: selected ? 3 : 2,
          backgroundColor: colors.background,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <View style={styles.optionVisual}>{visual}</View>
      <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Titre de section (même style dans le picker et la sheet de session). */
function SectionTitle({ children }: { children: ReactNode }) {
  const colors = useTheme();
  return <Text style={[styles.title, { color: colors.accent }]}>{children}</Text>;
}

/** Section 1 : l'état d'Ubuntu au moment du départ. */
export function DepartureStateRow({
  title = 'IL ÉTAIT COMMENT AU DÉPART ?',
  value,
  onPick,
  header,
}: {
  title?: string;
  value: DepartureState | null;
  onPick: (state: DepartureState) => void;
  /** Contenu optionnel à droite du titre (ex. la croix de fermeture). */
  header?: ReactNode;
}) {
  return (
    <>
      <View style={styles.header}>
        <SectionTitle>{title}</SectionTitle>
        {header}
      </View>
      <View style={styles.row}>
        {STATES.map(({ value: state, emoji, label }) => (
          <PickOption
            key={state}
            visual={<Text style={styles.optionEmoji}>{emoji}</Text>}
            label={label}
            selected={value === state}
            onPress={() => onPick(state)}
          />
        ))}
      </View>
    </>
  );
}

/** Section 2 : qui participe (décoché = pas dans l'appartement du tout). */
export function ParticipantsRow({
  title = 'QUI PARTICIPE ?',
  value,
  onToggle,
}: {
  title?: string;
  value: Participant[];
  onToggle: (who: Participant) => void;
}) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <View style={styles.row}>
        {PARTICIPANTS.map(({ value: who, label }) => {
          const selected = value.includes(who);
          const sprite = AVATARS[who];
          return (
            <PickOption
              key={who}
              visual={
                <Image
                  source={sprite.source}
                  style={{ width: sprite.w, height: sprite.h, opacity: selected ? 1 : 0.35 }}
                  contentFit="contain"
                />
              }
              label={label}
              selected={selected}
              onPress={() => onToggle(who)}
            />
          );
        })}
      </View>
    </>
  );
}

/** Section 3 : où sera (était) CE participant — son avatar sur trois fonds.
 * Une ligne par participant : Fiona peut être dans le couloir pendant que
 * Greg est en bas. */
export function HumanLocationRow({
  title,
  person,
  value,
  onPick,
}: {
  title: string;
  /** Le participant concerné (son avatar est posé sur les scènes). */
  person: Participant;
  value: HumanLocation | null;
  onPick: (location: HumanLocation) => void;
}) {
  const avatar = AVATARS[person];
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <View style={styles.row}>
        {LOCATIONS.map(({ value: location, label }) => (
          <PickOption
            key={location}
            visual={
              <>
                {location === 'couloir' ? (
                  <View style={[StyleSheet.absoluteFill, styles.hallway]} />
                ) : location === 'en_bas' ? (
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
              </>
            }
            label={label}
            selected={value === location}
            onPress={() => onPick(location)}
          />
        ))}
      </View>
    </>
  );
}

/** Titre de la ligne de localisation d'un participant. */
export function locationRowTitle(person: Participant, past: boolean): string {
  const name = person === 'fiona' ? 'FIONA' : 'GREG';
  return past ? `OÙ ÉTAIT ${name} ?` : `OÙ SERA ${name} ?`;
}

/**
 * Mini-picker affiché juste après le tap SOLO : (1) l'état d'Ubuntu au
 * moment du départ (la variable la plus prédictive), (2) qui participe à
 * l'exercice (les deux par défaut ; décocher quelqu'un = il n'était pas
 * dans l'appartement du tout) et (3) où sera CHAQUE participant pendant
 * la session — une ligne par participant coché. Le panneau se ferme tout
 * seul quand l'état et toutes les localisations sont répondus.
 */
export function SoloPicker({
  top,
  onPickState,
  onPickLocation,
  onPickParticipants,
  onDismiss,
}: {
  top: number;
  onPickState: (state: DepartureState) => void;
  /** Localisation d'UN participant (appelé une fois par ligne). */
  onPickLocation: (person: Participant, location: HumanLocation) => void;
  onPickParticipants: (participants: Participant[]) => void;
  onDismiss: () => void;
}) {
  const colors = useTheme();
  const [pickedState, setPickedState] = useState<DepartureState | null>(null);
  const [locations, setLocations] = useState<Record<Participant, HumanLocation | null>>({
    fiona: null,
    greg: null,
  });
  const [participants, setParticipants] = useState<Participant[]>(['fiona', 'greg']);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Ferme le panneau (un instant après) quand tout est répondu :
      l'état + la localisation de CHAQUE participant coché. */
  const maybeClose = (
    state: DepartureState | null,
    nextLocations: Record<Participant, HumanLocation | null>,
    nextParticipants: Participant[]
  ) => {
    if (!state || closeTimer.current) return;
    if (nextParticipants.some((p) => !nextLocations[p])) return;
    closeTimer.current = setTimeout(onDismiss, 350);
  };

  const pickState = (state: DepartureState) => {
    setPickedState(state);
    onPickState(state);
    maybeClose(state, locations, participants);
  };

  const pickLocation = (person: Participant, location: HumanLocation) => {
    const next = { ...locations, [person]: location };
    setLocations(next);
    onPickLocation(person, location);
    maybeClose(pickedState, next, participants);
  };

  /** Coche/décoche un participant (au moins un doit rester). */
  const toggleParticipant = (who: Participant) => {
    const next = participants.includes(who)
      ? participants.filter((p) => p !== who)
      : [...participants, who];
    if (next.length === 0) return;
    setParticipants(next);
    onPickParticipants(next);
    maybeClose(pickedState, locations, next);
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
      <DepartureStateRow
        value={pickedState}
        onPick={pickState}
        header={
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Text style={[styles.dismiss, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
        }
      />
      <ParticipantsRow value={participants} onToggle={toggleParticipant} />
      {/* Une ligne de localisation PAR participant coché. */}
      {PARTICIPANTS.filter(({ value }) => participants.includes(value)).map(({ value }) => (
        <HumanLocationRow
          key={value}
          title={locationRowTitle(value, false)}
          person={value}
          value={locations[value]}
          onPick={(location) => pickLocation(value, location)}
        />
      ))}
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
  // Case commune : visuel 44 de haut + libellé — même hauteur partout.
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: 2,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  optionVisual: {
    alignSelf: 'stretch',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionEmoji: {
    fontSize: 16,
  },
  optionText: {
    fontSize: 5.5,
  },
  hallway: {
    backgroundColor: '#55555E',
  },
});
