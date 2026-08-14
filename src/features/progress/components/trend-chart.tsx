import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useAppTheme } from '@/hooks/use-app-theme';

export function TrendChart({ values, label }: { values: number[]; label: string }) {
  const { colors } = useAppTheme();
  if (values.length < 2) return null;
  const width = 330; const height = 150; const padding = 22;
  const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1;
  const points = values.map((value, index) => ({ x: padding + index * ((width - padding * 2) / (values.length - 1)), y: height - padding - ((value - min) / range) * (height - padding * 2) }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  return <Svg accessibilityLabel={`${label} trend chart`} width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
    <Line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke={colors.line} />
    <Path d={path} fill="none" stroke={colors.primary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    {points.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={4} fill={colors.primary} />)}
    <SvgText x={padding} y={14} fill={colors.muted} fontSize={11}>{max.toFixed(1)}</SvgText>
    <SvgText x={padding} y={height - 5} fill={colors.muted} fontSize={11}>{min.toFixed(1)}</SvgText>
  </Svg>;
}
