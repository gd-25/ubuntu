import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';
import { openEpisodeClip } from '@/lib/clips';
import {
  episodeDurationSeconds,
  formatDuration,
  formatTime,
  formatVolume,
  KIND_EMOJI,
} from '@/lib/format';
import type { VocalEpisode } from '@/lib/types';

/** Bouton pixel « voir le clip vidéo » d'un épisode (URL signée 1 h). */
export function ClipButton({ clipPath }: { clipPath: string }) {
  const colors = useTheme();
  const [isOpening, setIsOpening] = useState(false);

  const open = async () => {
    setIsOpening(true);
    try {
      await openEpisodeClip(clipPath);
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Clip indisponible.');
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <Pressable
      onPress={open}
      disabled={isOpening}
      hitSlop={8}
      style={[
        styles.clipButton,
        { backgroundColor: colors.accent, borderColor: colors.border, opacity: isOpening ? 0.5 : 1 },
      ]}>
      {isOpening ? (
        <ActivityIndicator size="small" color={colors.accentText} />
      ) : (
        <Text style={[styles.clipButtonText, { color: colors.accentText }]}>▶ CLIP</Text>
      )}
    </Pressable>
  );
}

/**
 * Ligne d'épisode vocal (heure · type · durée · VOL n/5 · ▶ CLIP),
 * partagée entre le détail de session et le panneau live. `children`
 * accueille les actions optionnelles (ÉCARTER / ✕ du détail).
 */
export function EpisodeRow({
  episode,
  children,
}: {
  episode: VocalEpisode;
  children?: React.ReactNode;
}) {
  const colors = useTheme();
  // Couinement promu depuis « Autres bruits » : son clip vit dans le
  // sous-dossier noises/ — la ligne s'affiche en bleu pour le repérer.
  const isPromotedNoise = episode.clip_path?.includes('/noises/') ?? false;
  return (
    <View style={[styles.row, episode.dismissed && styles.dismissed]}>
      <View
        style={[styles.dot, { backgroundColor: isPromotedNoise ? colors.info : colors.bark }]}
      />
      <Text style={[styles.text, { color: isPromotedNoise ? colors.info : colors.text }]}>
        {formatTime(episode.started_at)} · {KIND_EMOJI[episode.kind] ?? ''}{' '}
        {formatDuration(episodeDurationSeconds(episode.started_at, episode.ended_at))}
        {formatVolume(episode.peak_rms) ? ` · ${formatVolume(episode.peak_rms)}` : ''}
        {isPromotedNoise ? ' · COUINEMENT PROMU' : episode.source === 'manual' ? ' · MANUEL' : ''}
        {episode.dismissed ? ' · ÉCARTÉ' : ''}
      </Text>
      {episode.clip_path ? <ClipButton clipPath={episode.clip_path} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  text: {
    fontSize: 7,
    lineHeight: 11,
    flex: 1,
    flexShrink: 1,
  },
  // Épisode écarté : visible mais grisé (il reste consultable, clip inclus).
  dismissed: {
    opacity: 0.45,
  },
  clipButton: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  clipButtonText: {
    fontSize: 7,
  },
});
