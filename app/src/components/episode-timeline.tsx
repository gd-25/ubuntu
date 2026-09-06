import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/format';
import { octaveBoundaries, octaveX, volumeFraction } from '@/lib/timeline';
import type { VocalEpisode } from '@/lib/types';

const TRACK_HEIGHT = 26;
const SVG_HEIGHT = 40;
const EXP_TRACK_HEIGHT = 44;
const EXP_SVG_HEIGHT = 48;
/** Largeur fidèle à l'échelle : plancher au trait de 1 px, jamais gonflée. */
const MIN_SEGMENT_WIDTH = 1;

/**
 * Frise horizontale des vocalises d'une session.
 *
 * - `scale="linear"` (défaut, revue a posteriori) : échelle linéaire simple.
 * - `scale="octave"` (panneau live) : la dernière minute occupe la moitié
 *   droite, chaque doublement d'ancienneté une bande égale à gauche, et la
 *   HAUTEUR de chaque trait encode le volume (peak_rms) — jaune pour les
 *   gémissements, orange pour aboiements/hurlements.
 */
export function EpisodeTimeline({
  episodes,
  sessionStart,
  sessionEnd,
  nowMs,
  scale = 'linear',
}: {
  episodes: VocalEpisode[];
  sessionStart: string;
  sessionEnd?: string | null;
  /** Right edge of the track for ongoing sessions (pass Date.now() from the caller). */
  nowMs?: number;
  scale?: 'linear' | 'octave';
}) {
  const colors = useTheme();
  const [width, setWidth] = useState(0);

  const startMs = new Date(sessionStart).getTime();
  const endMs = sessionEnd ? new Date(sessionEnd).getTime() : (nowMs ?? startMs + 60_000);
  const spanMs = Math.max(endMs - startMs, 1000);

  const isOctave = scale === 'octave';
  const trackHeight = isOctave ? EXP_TRACK_HEIGHT : TRACK_HEIGHT;
  const svgHeight = isOctave ? EXP_SVG_HEIGHT : SVG_HEIGHT;
  const trackY = (svgHeight - trackHeight) / 2;

  /** x d'un timestamp selon l'échelle choisie. */
  const xAt = (ms: number): number =>
    isOctave
      ? octaveX(endMs - ms, spanMs, width)
      : ((ms - startMs) / spanMs) * width;

  const boundaries = isOctave && width > 0 ? octaveBoundaries(spanMs) : [];

  return (
    <View style={styles.container}>
      {/* La hauteur du SVG est réservée dès le premier rendu (la piste
          apparaît au 2e passage, une fois la largeur mesurée) : sinon le
          panneau parent fige sa hauteur sans elle pendant son animation
          d'entrée et le bas du contenu déborde. */}
      <View style={{ height: svgHeight }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={svgHeight}>
          <Rect
            x={0}
            y={trackY}
            width={width}
            height={trackHeight}
            rx={6}
            fill={colors.calm}
          />
          {/* Frontières d'octaves (-1, -2, -4… min) en pointillés. */}
          {boundaries.map((age) => {
            const x = octaveX(age, spanMs, width);
            return (
              <Line
                key={`b${age}`}
                x1={x}
                y1={trackY}
                x2={x}
                y2={trackY + trackHeight}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="2,3"
                opacity={0.45}
              />
            );
          })}
          {episodes.map((episode) => {
            const from = new Date(episode.started_at).getTime();
            const to = new Date(episode.ended_at).getTime();
            const x1 = xAt(from);
            const x2 = xAt(to);
            const w = Math.max(x2 - x1, MIN_SEGMENT_WIDTH);
            const x = Math.min(Math.max(x1, 0), width - MIN_SEGMENT_WIDTH);
            // Hauteur = volume (octave) ; pleine hauteur en linéaire.
            const h = isOctave
              ? Math.max(4, trackHeight * volumeFraction(episode.peak_rms))
              : trackHeight;
            return (
              <Rect
                key={episode.id}
                x={x}
                y={trackY + trackHeight - h}
                width={Math.min(w, width - x)}
                height={h}
                rx={isOctave ? 0.5 : 2}
                fill={episode.kind === 'whine' && isOctave ? colors.whine : colors.bark}
              />
            );
          })}
          <Line x1={0} y1={trackY} x2={0} y2={trackY + trackHeight} stroke={colors.border} strokeWidth={2} />
          <Line
            x1={width - 1}
            y1={trackY}
            x2={width - 1}
            y2={trackY + trackHeight}
            stroke={colors.border}
            strokeWidth={2}
          />
        </Svg>
      ) : null}
      {/* Labels d'octaves (-1, -2, -4… MIN), posés sous les pointillés —
          on saute ceux qui toucheraient les bords (heure de début à gauche). */}
      {boundaries.map((age, i) => {
        const x = octaveX(age, spanMs, width);
        if (x < 30 || x > width - 34) return null;
        const isLast = i === 0;
        return (
          <Text
            key={`l${age}`}
            style={[
              styles.octaveLabel,
              { color: colors.textSecondary, left: x - 14, bottom: -2 },
            ]}
            numberOfLines={1}>
            {isLast ? '-1 MIN' : `-${Math.round(age / 60_000)}`}
          </Text>
        );
      })}
      </View>
      <View style={styles.axis}>
        <Text style={[styles.axisLabel, { color: colors.textSecondary }]}>
          {formatTime(sessionStart)}
        </Text>
        <Text style={[styles.axisLabel, { color: colors.textSecondary }]}>
          {sessionEnd ? formatTime(sessionEnd) : 'maintenant'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontSize: 11,
  },
  octaveLabel: {
    position: 'absolute',
    width: 28,
    fontSize: 5,
    textAlign: 'center',
  },
});
