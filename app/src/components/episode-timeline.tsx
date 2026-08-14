import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/format';
import type { VocalEpisode } from '@/lib/types';

const TRACK_HEIGHT = 26;
const SVG_HEIGHT = 40;
const MIN_SEGMENT_WIDTH = 3;

/**
 * Horizontal timeline of vocal episodes across a session's duration.
 * Une seule couleur pour toutes les vocalises — la variable intéressante
 * est le volume (affiché dans la liste), pas la famille bark/howl/whine.
 */
export function EpisodeTimeline({
  episodes,
  sessionStart,
  sessionEnd,
  nowMs,
}: {
  episodes: VocalEpisode[];
  sessionStart: string;
  sessionEnd?: string | null;
  /** Right edge of the track for ongoing sessions (pass Date.now() from the caller). */
  nowMs?: number;
}) {
  const colors = useTheme();
  const [width, setWidth] = useState(0);

  const startMs = new Date(sessionStart).getTime();
  const endMs = sessionEnd ? new Date(sessionEnd).getTime() : (nowMs ?? startMs + 60_000);
  const spanMs = Math.max(endMs - startMs, 1000);

  const trackY = (SVG_HEIGHT - TRACK_HEIGHT) / 2;

  return (
    <View style={styles.container}>
      {/* La hauteur du SVG est réservée dès le premier rendu (la piste
          apparaît au 2e passage, une fois la largeur mesurée) : sinon le
          panneau parent fige sa hauteur sans elle pendant son animation
          d'entrée et le bas du contenu déborde. */}
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={SVG_HEIGHT}>
          <Rect
            x={0}
            y={trackY}
            width={width}
            height={TRACK_HEIGHT}
            rx={6}
            fill={colors.calm}
          />
          {episodes.map((episode) => {
            const from = new Date(episode.started_at).getTime();
            const to = new Date(episode.ended_at).getTime();
            const x = ((from - startMs) / spanMs) * width;
            const w = Math.max(((to - from) / spanMs) * width, MIN_SEGMENT_WIDTH);
            return (
              <Rect
                key={episode.id}
                x={Math.min(Math.max(x, 0), width - MIN_SEGMENT_WIDTH)}
                y={trackY}
                width={Math.min(w, width)}
                height={TRACK_HEIGHT}
                rx={2}
                fill={colors.bark}
              />
            );
          })}
          <Line x1={0} y1={trackY} x2={0} y2={trackY + TRACK_HEIGHT} stroke={colors.border} strokeWidth={2} />
          <Line
            x1={width - 1}
            y1={trackY}
            x2={width - 1}
            y2={trackY + TRACK_HEIGHT}
            stroke={colors.border}
            strokeWidth={2}
          />
        </Svg>
      ) : null}
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
  track: {
    height: SVG_HEIGHT,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontSize: 11,
  },
});
