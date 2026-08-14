import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, Screen, SectionHeader } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ageFromBirthDate } from '@/features/nutrition/services/nutrition-targets';
import { TrendChart } from '@/features/progress/components/trend-chart';
import { useProgressDashboard } from '@/features/progress/hooks/use-progress';
import { bmiCategory, type BodyFatEstimate } from '@/features/progress/services/body-composition';
import { summarizeComposition, weeklyComposition, type CompositionSummary } from '@/features/progress/services/weekly-body-metrics';
import { sevenDayMovingAverage } from '@/features/progress/services/moving-average';
import { summarizeRecomposition } from '@/features/progress/services/recomposition-summary';
import { useAppTheme } from '@/hooks/use-app-theme';
import { cmToIn, kgToLb } from '@/lib/units';
import type { Tables } from '@/types/database';

type Range = '1M' | '3M' | '6M' | '1Y' | 'All';
type Segment = 'body' | 'training';

export default function ProgressScreen() {
  const { colors } = useAppTheme();
  const query = useProgressDashboard();
  const [range, setRange] = useState<Range>('3M');
  const [segment, setSegment] = useState<Segment>('body');
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  if (query.isLoading) return <Screen safeEdges={['top', 'left', 'right']}><LoadingState /></Screen>;
  if (query.isError) return <Screen safeEdges={['top', 'left', 'right']}><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;

  const data = query.data!;
  const imperial = data.preferredUnits === 'imperial';
  const days = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, All: Infinity }[range];
  const cutoff = Date.now() - days * 86_400_000;
  const metrics = data.metrics.filter((item) => days === Infinity || new Date(item.measured_at).getTime() >= cutoff);
  const weightPoints = metrics.flatMap((item) => item.weight_kg === null ? [] : [{ date: item.measured_at, value: imperial ? kgToLb(item.weight_kg) : item.weight_kg }]);
  const weights = weightPoints.map((item) => item.value);
  const weightAverage = sevenDayMovingAverage(weightPoints).map((item) => item.value);
  const waists = metrics.flatMap((item) => item.waist_cm === null ? [] : [imperial ? item.waist_cm * 0.3937007874 : item.waist_cm]);
  const training = data.training.filter((item) => item.week_start && (days === Infinity || new Date(item.week_start).getTime() >= cutoff));
  const proteinAdherence = data.proteinTarget && data.nutrition.length ? data.nutrition.filter((item) => (item.protein_grams ?? 0) >= data.proteinTarget!).length / data.nutrition.length * 100 : null;
  const summary = summarizeRecomposition(metrics, { workoutWeeks: training.map((item) => item.workouts ?? 0), strengthValues: [], proteinAdherencePercent: proteinAdherence });
  const savedMetrics = [...data.metrics].reverse();
  const visibleMetrics = showAllMetrics ? savedMetrics : savedMetrics.slice(0, 5);

  // Composition runs off weekly averages, the same basis Today uses, so daily noise cannot
  // swing the number and the two screens can never disagree.
  const compositionProfile = {
    heightCm: data.profile?.height_cm === null || data.profile?.height_cm === undefined ? null : Number(data.profile.height_cm),
    age: data.profile?.birth_date ? ageFromBirthDate(data.profile.birth_date) : null,
    biologicalSex: data.profile?.biological_sex,
  };
  const compositionReadings = data.metrics.map((item) => ({
    measuredAt: item.measured_at,
    weightKg: item.weight_kg === null ? null : Number(item.weight_kg),
    waistCm: item.waist_cm === null ? null : Number(item.waist_cm),
    bodyFatPercent: item.body_fat_percent === null ? null : Number(item.body_fat_percent),
  }));
  const composition = summarizeComposition(compositionReadings, compositionProfile);
  const bodyFatSeries = weeklyComposition(compositionReadings, compositionProfile)
    .filter((week) => days === Infinity || new Date(`${week.weekStart}T00:00:00`).getTime() >= cutoff)
    .flatMap((week) => (week.fat ? [week.fat.percent] : []));

  return (
    <Screen safeEdges={['top', 'left', 'right']}>
      <View style={styles.header}><AppText variant="title">Progress</AppText><AppText color={colors.muted}>See the direction, not the daily noise.</AppText></View>
      <View style={[styles.segments, { backgroundColor: colors.surface }]}>{(['body', 'training'] as const).map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: segment === item }} key={item} onPress={() => setSegment(item)} style={[styles.segment, segment === item && { backgroundColor: colors.softAccent }]}><AppText variant="caption" color={segment === item ? colors.primary : colors.muted}>{item === 'body' ? 'Body' : 'Training'}</AppText></Pressable>)}</View>
      <View style={styles.ranges}>{(['1M', '3M', '6M', '1Y', 'All'] as const).map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: range === item }} key={item} onPress={() => setRange(item)} style={[styles.range, range === item && { backgroundColor: colors.softAccent }]}><AppText variant="caption" color={range === item ? colors.primary : colors.muted}>{item}</AppText></Pressable>)}</View>

      {segment === 'body' ? <>
        {!data.metrics.length
          ? <EmptyState title="Start with a baseline" description="Log weight or a measurement to begin seeing useful trends." action={<Link href="/progress/log" asChild><Button>Log measurement</Button></Link>} />
          : <>
              <View style={[styles.summary, { backgroundColor: colors.softAccent }]}><AppText variant="eyebrow" color={summary.kind === 'positive' ? colors.primary : colors.muted}>{summary.title}</AppText><AppText>{summary.detail}</AppText></View>
              {weights.length > 1 ? <Card><AppText variant="heading">Weight · {imperial ? 'lb' : 'kg'}</AppText><TrendChart values={weights} label="Weight" />{weightAverage.length > 1 ? <AppText variant="caption" color={colors.muted}>7-day average: {weightAverage.at(-1)?.toFixed(1)} {imperial ? 'lb' : 'kg'}</AppText> : null}</Card> : null}
              {waists.length > 1 ? <Card><AppText variant="heading">Waist · {imperial ? 'in' : 'cm'}</AppText><TrendChart values={waists} label="Waist" /></Card> : null}
              {composition ? <BodyComposition summary={composition} series={bodyFatSeries} imperial={imperial} /> : null}
              <View style={styles.actions}><Link href="/progress/log" asChild><Button style={styles.growingAction}>Log measurement</Button></Link><Link href="/progress/photo" asChild><Button style={styles.growingAction} variant="secondary">Add progress photo</Button></Link></View>
              <SectionHeader title="Saved measurements" action={savedMetrics.length > 5 ? <Pressable accessibilityRole="button" onPress={() => setShowAllMetrics((current) => !current)} hitSlop={8}><AppText variant="caption" color={colors.primary}>{showAllMetrics ? 'Show less' : 'View all'}</AppText></Pressable> : undefined} />
              <Card style={styles.measurementList}>
                {visibleMetrics.map((metric, index) => {
                  const date = new Date(metric.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <Link key={metric.id} href={{ pathname: '/progress/log', params: { id: metric.id } }} asChild>
                      <Pressable
                        accessibilityLabel={`Edit measurement from ${date}`}
                        accessibilityRole="button"
                        style={({ pressed }) => [styles.measurementRow, index < visibleMetrics.length - 1 && { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}>
                        <View style={styles.measurementCopy}>
                          <AppText numberOfLines={1} ellipsizeMode="tail">{formatMetric(metric, imperial)}</AppText>
                          <AppText variant="caption" color={colors.muted} numberOfLines={1}>{date}</AppText>
                        </View>
                      </Pressable>
                    </Link>
                  );
                })}
              </Card>
            </>}
      </> : <>
        {!training.length && !data.bests.length
          ? <EmptyState title="No training trend yet" description="Complete a few workouts and your consistency and strength trends will appear here." action={<Link href="/(tabs)/workouts" asChild><Button>Go to Train</Button></Link>} />
          : <>
              {training.length ? <><SectionHeader title="Consistency" /><Card><TrendChart values={training.map((week) => week.workouts ?? 0)} label="Weekly workout frequency" /><AppText variant="caption" color={colors.muted}>{training.slice(-4).reduce((sum, week) => sum + (week.workouts ?? 0), 0)} workouts in the latest four tracked weeks</AppText></Card></> : null}
              {data.bests.length ? <><SectionHeader title="Personal bests" /><Card>{data.bests.map((best) => <View key={best.exercise_key} style={[styles.bestRow, { borderBottomColor: colors.line }]}><AppText style={styles.bestName}>{best.exercise_name}</AppText><AppText variant="heading" color={colors.primary}>{Math.round(imperial ? kgToLb(best.max_weight_kg ?? 0) : (best.max_weight_kg ?? 0))} {imperial ? 'lb' : 'kg'}</AppText></View>)}</Card></> : null}
            </>}
      </>}
    </Screen>
  );
}

const bmiLabels: Record<ReturnType<typeof bmiCategory>, string> = {
  underweight: 'Underweight',
  healthy: 'Healthy range',
  overweight: 'Overweight',
  obese: 'Obese',
};

const fatLabels: Record<BodyFatEstimate['category'], string> = {
  essential: 'Essential fat only',
  athletic: 'Athletic',
  fitness: 'Fitness',
  average: 'Average',
  obese: 'Obese',
};

const methodNotes: Record<BodyFatEstimate['method'], string> = {
  measured: 'From the body fat you logged.',
  rfm: 'Relative Fat Mass, from your height and waist.',
  deurenberg: 'Estimated from BMI and age. Log a waist measurement for a closer read.',
};

function BodyComposition({ summary, series, imperial }: { summary: CompositionSummary; series: number[]; imperial: boolean }) {
  const { colors } = useAppTheme();
  const { current, bmiChange, bodyFatChange } = summary;
  const fat = current.fat;
  const mass = (kg: number) => `${Math.round(imperial ? kgToLb(kg) : kg)} ${imperial ? 'lb' : 'kg'}`;
  const delta = (change: number | null, unit: string) =>
    change === null ? 'first week' : Math.abs(change) < 0.05 ? 'holding' : `${change > 0 ? '+' : ''}${change.toFixed(1)}${unit} vs last week`;

  return (
    <Card>
      <View style={styles.sectionTitle}>
        <AppText variant="heading">Body composition</AppText>
        <AppText variant="caption" color={colors.muted}>{current.readings} log{current.readings === 1 ? '' : 's'} this week</AppText>
      </View>
      <View style={styles.compositionRow}>
        {current.bmi !== null ? (
          <View style={[styles.compositionStat, { backgroundColor: colors.raised }]}>
            <AppText variant="caption" color={colors.muted}>BMI</AppText>
            <AppText variant="heading">{current.bmi.toFixed(1)}</AppText>
            <AppText variant="caption" color={colors.muted}>{bmiLabels[bmiCategory(current.bmi)]}</AppText>
            <AppText variant="caption" color={colors.muted}>{delta(bmiChange, '')}</AppText>
          </View>
        ) : null}
        {fat ? (
          <View style={[styles.compositionStat, { backgroundColor: colors.raised }]}>
            <AppText variant="caption" color={colors.muted}>Body fat</AppText>
            <AppText variant="heading">{fat.percent.toFixed(1)}%</AppText>
            <AppText variant="caption" color={colors.muted}>{fatLabels[fat.category]}</AppText>
            <AppText variant="caption" color={colors.muted}>{delta(bodyFatChange, ' pts')}</AppText>
          </View>
        ) : null}
        {fat?.leanMassKg !== null && fat?.leanMassKg !== undefined ? (
          <View style={[styles.compositionStat, { backgroundColor: colors.raised }]}>
            <AppText variant="caption" color={colors.muted}>Lean mass</AppText>
            <AppText variant="heading">{mass(fat.leanMassKg)}</AppText>
            <AppText variant="caption" color={colors.muted}>{mass(fat.fatMassKg ?? 0)} fat</AppText>
          </View>
        ) : null}
      </View>
      {series.length > 1 ? <TrendChart values={series} label="Weekly body fat percentage" /> : null}
      {fat ? (
        <AppText variant="caption" color={colors.muted}>
          {methodNotes[fat.method]}
          {fat.standardErrorPoints === null
            ? ''
            : ` Figures use this week's average, not a single day. Tape estimates land within about ${fat.standardErrorPoints} points of a DXA scan, so track the direction rather than the exact number.`}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { minWidth: 0, gap: spacing.xs },
  sectionTitle: { minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  compositionRow: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  compositionStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  segments: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.pill },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  ranges: { flexDirection: 'row', gap: spacing.xs },
  range: { minWidth: 0, flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  summary: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  growingAction: { flexGrow: 1, flexBasis: 148 },
  measurementList: { paddingVertical: spacing.xs, gap: 0 },
  measurementRow: { minWidth: 0, height: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  measurementCopy: { flex: 1, minWidth: 0, gap: 2 },
  pressed: { opacity: 0.65 },
  bestRow: { minWidth: 0, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  bestName: { flex: 1, minWidth: 0 },
});

function formatMetric(metric: Tables<'body_metrics'>, imperial: boolean) {
  const values: string[] = [];
  const format = (value: number) => Number(value.toFixed(1)).toString();
  if (metric.weight_kg !== null) values.push(`${format(imperial ? kgToLb(metric.weight_kg) : metric.weight_kg)} ${imperial ? 'lb' : 'kg'}`);
  if (metric.waist_cm !== null) values.push(`Waist ${format(imperial ? cmToIn(metric.waist_cm) : metric.waist_cm)} ${imperial ? 'in' : 'cm'}`);
  if (metric.body_fat_percent !== null) values.push(`${format(metric.body_fat_percent)}% body fat`);
  if (metric.chest_cm !== null) values.push(`Chest ${format(imperial ? cmToIn(metric.chest_cm) : metric.chest_cm)} ${imperial ? 'in' : 'cm'}`);
  if (metric.arm_cm !== null) values.push(`Arm ${format(imperial ? cmToIn(metric.arm_cm) : metric.arm_cm)} ${imperial ? 'in' : 'cm'}`);
  if (metric.thigh_cm !== null) values.push(`Thigh ${format(imperial ? cmToIn(metric.thigh_cm) : metric.thigh_cm)} ${imperial ? 'in' : 'cm'}`);
  return values.join(' · ');
}
