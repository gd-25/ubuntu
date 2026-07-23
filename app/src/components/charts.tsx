import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { APP_FONT, Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';

const CHART_HEIGHT = 160;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 24;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

export interface ChartPoint {
  label: string;
  value: number;
}

/** Simple vertical bar chart. Values are expected >= 0. */
export function BarChart({
  data,
  formatValue,
  color,
}: {
  data: ChartPoint[];
  formatValue: (value: number) => string;
  color?: string;
}) {
  const colors = useTheme();
  const [width, setWidth] = useState(0);
  const barColor = color ?? colors.accent;

  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = width / data.length;
  const barWidth = Math.max(Math.min(slot * 0.6, 48), 6);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT}>
          <Line
            x1={0}
            y1={PADDING_TOP + PLOT_HEIGHT}
            x2={width}
            y2={PADDING_TOP + PLOT_HEIGHT}
            stroke={colors.border}
            strokeWidth={1}
          />
          {data.map((point, i) => {
            const h = (point.value / max) * PLOT_HEIGHT;
            const x = i * slot + (slot - barWidth) / 2;
            const y = PADDING_TOP + PLOT_HEIGHT - h;
            return (
              <Rect key={point.label + i} x={x} y={y} width={barWidth} height={h} rx={3} fill={barColor} />
            );
          })}
          {data.map((point, i) => (
            <SvgText
              key={'v' + point.label + i}
              x={i * slot + slot / 2}
              y={PADDING_TOP + PLOT_HEIGHT - (point.value / max) * PLOT_HEIGHT - 5}
              fontSize={7}
              fontFamily={APP_FONT}
              fill={colors.textSecondary}
              textAnchor="middle">
              {formatValue(point.value)}
            </SvgText>
          ))}
          {data.map((point, i) => (
            <SvgText
              key={'l' + point.label + i}
              x={i * slot + slot / 2}
              y={CHART_HEIGHT - 8}
              fontSize={7}
              fontFamily={APP_FONT}
              fill={colors.textSecondary}
              textAnchor="middle">
              {point.label}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** Simple line chart with dots. */
export function LineChart({
  data,
  formatValue,
}: {
  data: ChartPoint[];
  formatValue: (value: number) => string;
}) {
  const colors = useTheme();
  const [width, setWidth] = useState(0);

  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = width / data.length;

  const xOf = (i: number) => i * slot + slot / 2;
  const yOf = (v: number) => PADDING_TOP + PLOT_HEIGHT - (v / max) * PLOT_HEIGHT;
  const points = data.map((d, i) => `${xOf(i)},${yOf(d.value)}`).join(' ');

  // Only label first / middle / last x labels to avoid clutter.
  const labelIndexes = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT}>
          <Line
            x1={0}
            y1={PADDING_TOP + PLOT_HEIGHT}
            x2={width}
            y2={PADDING_TOP + PLOT_HEIGHT}
            stroke={colors.border}
            strokeWidth={1}
          />
          {data.length > 1 ? (
            <Polyline points={points} fill="none" stroke={colors.accent} strokeWidth={2} />
          ) : null}
          {data.map((point, i) => (
            <Circle key={'c' + i} cx={xOf(i)} cy={yOf(point.value)} r={3.5} fill={colors.accent} />
          ))}
          {data.map((point, i) =>
            labelIndexes.has(i) ? (
              <SvgText
                key={'l' + i}
                x={xOf(i)}
                y={CHART_HEIGHT - 8}
                fontSize={7}
              fontFamily={APP_FONT}
                fill={colors.textSecondary}
                textAnchor="middle">
                {point.label}
              </SvgText>
            ) : null
          )}
          <SvgText
            x={4}
            y={PADDING_TOP - 4}
            fontSize={7}
              fontFamily={APP_FONT}
            fill={colors.textSecondary}
            textAnchor="start">
            {`max ${formatValue(max)}`}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

export function ChartCaption({ children }: { children: string }) {
  const colors = useTheme();
  return <Text style={[styles.caption, { color: colors.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 8,
    lineHeight: 13,
  },
});
