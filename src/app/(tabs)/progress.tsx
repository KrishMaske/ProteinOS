import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Field, LoadingState, Screen, SectionHeader } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ageFromBirthDate, type BiologicalSex } from '@/features/nutrition/services/nutrition-targets';
import { TrendChart } from '@/features/progress/components/trend-chart';
import { useProgressDashboard } from '@/features/progress/hooks/use-progress';
import {
  bmiCategory,
  explainBmi,
  explainBodyFat,
  explainLeanMass,
  healthyBodyFatRange,
  healthyWeightRangeKg,
  positionInRange,
  unitFormatter,
  verdictForRange,
  HEALTHY_BMI,
  type RangeVerdict,
} from '@/features/progress/services/body-composition';
import { useUpdateSettings } from '@/features/settings/hooks/use-settings';
import { summarizeComposition, weeklyComposition } from '@/features/progress/services/weekly-body-metrics';
import { sevenDayMovingAverage } from '@/features/progress/services/moving-average';
import { summarizeRecomposition } from '@/features/progress/services/recomposition-summary';
import { useAppTheme } from '@/hooks/use-app-theme';
import { cmToIn, kgToLb } from '@/lib/units';
import type { Tables } from '@/types/database';

type Range = '1M' | '3M' | '6M' | '1Y' | 'All';
type Segment = 'body' | 'composition' | 'training';
const segments: { key: Segment; label: string }[] = [
  { key: 'body', label: 'Body' },
  { key: 'composition', label: 'Composition' },
  { key: 'training', label: 'Training' },
];

export default function ProgressScreen() {
  const { colors } = useAppTheme();
  const query = useProgressDashboard();
  const [range, setRange] = useState<Range>('3M');
  // Today links straight to a segment, so honour that on first render.
  const { segment: requested } = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>(
    () => segments.some((item) => item.key === requested) ? (requested as Segment) : 'body',
  );
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
  const goalBand = data.profile?.goal_body_fat_min === null || data.profile?.goal_body_fat_min === undefined
    || data.profile?.goal_body_fat_max === null || data.profile?.goal_body_fat_max === undefined
    ? null
    : { min: Number(data.profile.goal_body_fat_min), max: Number(data.profile.goal_body_fat_max) };
  const bodyFatSeries = weeklyComposition(compositionReadings, compositionProfile)
    .filter((week) => days === Infinity || new Date(`${week.weekStart}T00:00:00`).getTime() >= cutoff)
    .flatMap((week) => (week.fat ? [week.fat.percent] : []));

  return (
    <Screen safeEdges={['top', 'left', 'right']}>
      <View style={styles.header}><AppText variant="title">Progress</AppText></View>
      <View style={[styles.segments, { backgroundColor: colors.surface }]}>{segments.map(({ key, label }) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: segment === key }} key={key} onPress={() => setSegment(key)} style={[styles.segment, segment === key && { backgroundColor: colors.softAccent }]}><AppText variant="caption" numberOfLines={1} color={segment === key ? colors.primary : colors.muted}>{label}</AppText></Pressable>)}</View>
      <View style={styles.ranges}>{(['1M', '3M', '6M', '1Y', 'All'] as const).map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: range === item }} key={item} onPress={() => setRange(item)} style={[styles.range, range === item && { backgroundColor: colors.softAccent }]}><AppText variant="caption" color={range === item ? colors.primary : colors.muted}>{item}</AppText></Pressable>)}</View>

      {segment === 'body' ? <>
        {!data.metrics.length
          ? <EmptyState title="Start with a baseline" description="Log weight or a measurement to begin seeing useful trends." action={<Link href="/progress/log" asChild><Button>Log measurement</Button></Link>} />
          : <>
              {summary.kind === 'insufficient'
                ? <EmptyState title={summary.title} description={summary.detail} action={<Link href="/progress/log" asChild><Button>Log measurement</Button></Link>} />
                : <View style={[styles.summary, { backgroundColor: colors.softAccent }]}><AppText variant="eyebrow" color={summary.kind === 'positive' ? colors.primary : colors.muted}>{summary.title}</AppText><AppText>{summary.detail}</AppText></View>}
              {weights.length > 1 ? <Card><AppText variant="heading">Weight · {imperial ? 'lb' : 'kg'}</AppText><TrendChart values={weights} label="Weight" />{weightAverage.length > 1 ? <AppText variant="caption" color={colors.muted}>7-day average: {weightAverage.at(-1)?.toFixed(1)} {imperial ? 'lb' : 'kg'}</AppText> : null}</Card> : null}
              {waists.length > 1 ? <Card><AppText variant="heading">Waist · {imperial ? 'in' : 'cm'}</AppText><TrendChart values={waists} label="Waist" /></Card> : null}
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
      </> : segment === 'composition' ? (
        <CompositionSegment
          composition={composition}
          profile={compositionProfile}
          bodyFatSeries={bodyFatSeries}
          goalBand={goalBand}
          imperial={imperial}
        />
      ) : <>
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

const verdictCopy: Record<RangeVerdict, string> = {
  below: 'Below the healthy range',
  within: 'Inside the healthy range',
  above: 'Above the healthy range',
};

/**
 * A band with the healthy window marked and a pin at the current value. The window is
 * drawn against a wider axis so being outside it is visible rather than pinned to an edge.
 */
function RangeGauge({ value, min, max, axisMin, axisMax, unit }: {
  value: number; min: number; max: number; axisMin: number; axisMax: number; unit?: string;
}) {
  const { colors } = useAppTheme();
  const verdict = verdictForRange(value, min, max);
  const pct = (input: number): `${number}%` => `${positionInRange(input, axisMin, axisMax) * 100}%`;
  return (
    <View style={styles.gaugeWrap}>
      <View style={[styles.gaugeTrack, { backgroundColor: colors.raised }]}>
        <View style={[styles.gaugeHealthy, { backgroundColor: colors.softAccent, left: pct(min), width: `${(positionInRange(max, axisMin, axisMax) - positionInRange(min, axisMin, axisMax)) * 100}%` }]} />
        <View style={[styles.gaugePin, { backgroundColor: verdict === 'within' ? colors.primary : colors.danger, left: pct(value) }]} />
      </View>
      <View style={styles.gaugeLabels}>
        <AppText variant="caption" color={colors.muted}>{axisMin}{unit}</AppText>
        <AppText variant="caption" color={verdict === 'within' ? colors.primary : colors.danger}>
          healthy {min}–{max}{unit}
        </AppText>
        <AppText variant="caption" color={colors.muted}>{axisMax}{unit}</AppText>
      </View>
    </View>
  );
}

/** Headline figure always visible; the explanation and formula sit behind a tap. */
function MetricCard({ title, value, valueColor, caption, details, children }: PropsWithChildren<{
  title: string;
  value: string;
  valueColor: string;
  caption: string;
  details: (string | null)[];
}>) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const shown = details.filter((line): line is string => Boolean(line));

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title} ${value}. ${open ? 'Hide' : 'Show'} details`}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [styles.compositionHeading, { opacity: pressed ? 0.7 : 1 }]}
      >
        <AppText variant="heading">{title}</AppText>
        <View style={styles.metricValue}>
          <AppText variant="heading" color={valueColor}>{value}</AppText>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </View>
      </Pressable>
      {children}
      <AppText variant="caption" color={colors.muted}>{caption}</AppText>
      {open ? shown.map((line) => (
        <AppText key={line} variant="caption" color={colors.muted} style={styles.formula}>{line}</AppText>
      )) : null}
    </Card>
  );
}

function CompositionSegment({ composition, profile, bodyFatSeries, goalBand, imperial }: {
  composition: ReturnType<typeof summarizeComposition>;
  profile: { heightCm: number | null; age: number | null; biologicalSex: BiologicalSex | null | undefined };
  bodyFatSeries: number[];
  goalBand: { min: number; max: number } | null;
  imperial: boolean;
}) {
  const { colors } = useAppTheme();
  const updateSettings = useUpdateSettings();
  const [editingGoal, setEditingGoal] = useState(false);

  if (!profile.heightCm) {
    return <EmptyState title="Add your height" description="Body composition needs your height to work out BMI and a healthy weight range." action={<Link href="/settings" asChild><Button>Open settings</Button></Link>} />;
  }
  if (!composition) {
    return <EmptyState title="No composition yet" description="Log a weight, and a waist measurement if you have a tape, to see BMI and body fat against healthy ranges." action={<Link href="/progress/log" asChild><Button>Log measurement</Button></Link>} />;
  }

  const { current } = composition;
  const healthyWeight = healthyWeightRangeKg(profile.heightCm);
  const healthyFat = healthyBodyFatRange(profile.age, profile.biologicalSex);
  const units = unitFormatter(imperial);
  const mass = (kg: number) => units.mass(kg);
  const fatInputs = {
    weightKg: current.weightKg ?? 0,
    heightCm: profile.heightCm,
    waistCm: current.waistCm,
    age: profile.age,
    biologicalSex: profile.biologicalSex,
    measuredBodyFatPercent: current.bodyFatPercent,
  };
  const fatVerdict = current.fat && healthyFat ? verdictForRange(current.fat.percent, healthyFat.min, healthyFat.max) : null;
  const goalVerdict = current.fat && goalBand ? verdictForRange(current.fat.percent, goalBand.min, goalBand.max) : null;

  return (
    <>
      <AppText variant="caption" color={colors.muted}>
        {current.readings === 1 ? 'From 1 log' : `Averaged from ${current.readings} logs`} this week
      </AppText>

      {current.bmi !== null ? (
        <MetricCard
          title="BMI"
          value={current.bmi.toFixed(1)}
          valueColor={bmiCategory(current.bmi) === 'healthy' ? colors.primary : colors.danger}
          caption={bmiLabels[bmiCategory(current.bmi)]}
          details={[
            healthyWeight ? `Healthy weight for your height: ${mass(healthyWeight.minKg)}–${mass(healthyWeight.maxKg)}` : null,
            current.weightKg !== null ? explainBmi(current.weightKg, profile.heightCm, units) : null,
            'Weight relative to height. It does not know muscle from fat, so a lean, heavily built person can read high.',
          ]}
        >
          <RangeGauge value={current.bmi} min={HEALTHY_BMI.min} max={HEALTHY_BMI.max} axisMin={15} axisMax={35} />
        </MetricCard>
      ) : null}

      {current.fat ? (
        <MetricCard
          title="Body fat"
          value={`${current.fat.percent.toFixed(1)}%`}
          valueColor={healthyFat && fatVerdict !== 'within' ? colors.danger : colors.primary}
          caption={healthyFat
            ? `${verdictCopy[fatVerdict!]} for age ${profile.age}`
            : 'Add your age in settings to see the healthy range'}
          details={[
            explainBodyFat(current.fat, fatInputs, units),
            healthyFat
              ? `Healthy for age ${profile.age}: ${healthyFat.min}–${healthyFat.max}%. These bands rise with age, so the same number reads differently at 25 and 55.`
              // The band shifts by up to 6 points across age groups, so without an age there
              // is no honest range to draw.
              : 'The healthy band depends on your age and shifts by up to 6 points across age groups.',
            current.fat.standardErrorPoints === null
              ? null
              : `A tape-based estimate lands within about ${current.fat.standardErrorPoints} points of a DXA scan.`,
          ]}
        >
          {healthyFat ? <RangeGauge value={current.fat.percent} min={healthyFat.min} max={healthyFat.max} axisMin={3} axisMax={45} unit="%" /> : null}
        </MetricCard>
      ) : null}

      {current.fat?.leanMassKg !== null && current.fat?.leanMassKg !== undefined ? (
        <MetricCard
          title="Lean mass"
          value={mass(current.fat.leanMassKg)}
          valueColor={colors.primary}
          caption={`${mass(current.fat.fatMassKg!)} fat`}
          details={[
            explainLeanMass(current.weightKg!, current.fat.percent, units),
            'Everything that is not fat: muscle, bone, organs and water. Holding this steady while weight falls is the goal of a cut.',
          ]}
        />
      ) : null}

      <Card>
        <View style={styles.compositionHeading}>
          <AppText variant="heading">Goal body fat</AppText>
          {goalBand && !editingGoal ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditingGoal(true)}>
              <AppText variant="caption" color={colors.primary}>Change</AppText>
            </Pressable>
          ) : null}
        </View>
        {goalBand && !editingGoal ? (
          <>
            <AppText variant="number" style={styles.goalValue}>
              {goalBand.min === goalBand.max ? `${goalBand.min}%` : `${goalBand.min}–${goalBand.max}%`}
            </AppText>
            {goalVerdict ? (
              <AppText variant="caption" color={goalVerdict === 'within' ? colors.primary : colors.muted}>
                {goalVerdict === 'within'
                  ? 'On target. Calories hold at maintenance.'
                  : goalVerdict === 'above'
                    ? `${(current.fat!.percent - goalBand.max).toFixed(1)} points to go.`
                    : `${(goalBand.min - current.fat!.percent).toFixed(1)} points below target.`}
              </AppText>
            ) : null}
          </>
        ) : (
          <GoalBodyFatPicker
            healthy={healthyFat}
            initial={goalBand}
            pending={updateSettings.isPending}
            onCancel={goalBand ? () => setEditingGoal(false) : undefined}
            onSave={(band) => updateSettings.mutate(
              { goal_body_fat_min: band?.min ?? null, goal_body_fat_max: band?.max ?? null },
              { onSuccess: () => setEditingGoal(false) },
            )}
          />
        )}
        {updateSettings.error ? <AppText variant="caption" color={colors.danger}>{updateSettings.error.message}</AppText> : null}
      </Card>

      {bodyFatSeries.length > 1 ? (
        <Card>
          <AppText variant="heading">Body fat trend</AppText>
          <TrendChart values={bodyFatSeries} label="Weekly body fat percentage" />
        </Card>
      ) : null}
    </>
  );
}

/** A single target is stored as a band with both bounds equal, so the taper logic is shared. */
function GoalBodyFatPicker({ healthy, initial, pending, onCancel, onSave }: {
  healthy: { min: number; max: number } | null;
  initial: { min: number; max: number } | null;
  pending: boolean;
  onCancel?: () => void;
  onSave: (band: { min: number; max: number } | null) => void;
}) {
  const { colors } = useAppTheme();
  const [mode, setMode] = useState<'single' | 'range'>(initial && initial.min !== initial.max ? 'range' : 'single');
  const [min, setMin] = useState(initial ? String(initial.min) : '');
  const [max, setMax] = useState(initial ? String(initial.max) : '');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const low = Number(min);
    if (!min.trim() || !Number.isFinite(low)) return setError('Enter a target percentage.');
    const high = mode === 'single' ? low : Number(max);
    if (mode === 'range' && (!max.trim() || !Number.isFinite(high))) return setError('Enter both ends of the range.');
    if (low < 3 || high > 60) return setError('Body fat goals must sit between 3% and 60%.');
    if (low > high) return setError('The lower bound must not exceed the upper bound.');
    setError(null);
    onSave({ min: Number(low.toFixed(1)), max: Number(high.toFixed(1)) });
  }

  return (
    <>
      <View style={styles.modeRow}>
        {(['single', 'range'] as const).map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === option }}
            key={option}
            onPress={() => { setMode(option); setError(null); }}
            style={[styles.modeOption, mode === option && { backgroundColor: colors.softAccent }]}>
            <AppText variant="caption" color={mode === option ? colors.primary : colors.muted}>
              {option === 'single' ? 'Single target' : 'Range'}
            </AppText>
          </Pressable>
        ))}
      </View>
      {healthy ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { setMode('range'); setMin(String(healthy.min)); setMax(String(healthy.max)); setError(null); }}
          style={({ pressed }) => [styles.preset, { backgroundColor: colors.raised, opacity: pressed ? 0.7 : 1 }]}>
          <AppText variant="caption">Use the healthy range for my age</AppText>
          <AppText variant="caption" color={colors.muted}>{healthy.min}–{healthy.max}%</AppText>
        </Pressable>
      ) : null}
      <View style={styles.goalFields}>
        <Field containerStyle={styles.goalField} label={mode === 'single' ? 'Target (%)' : 'From (%)'} keyboardType="decimal-pad" value={min} onChangeText={setMin} placeholder={healthy ? String(healthy.min) : '15'} />
        {mode === 'range' ? (
          <Field containerStyle={styles.goalField} label="To (%)" keyboardType="decimal-pad" value={max} onChangeText={setMax} placeholder={healthy ? String(healthy.max) : '20'} />
        ) : null}
      </View>
      {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
      <Button disabled={pending} onPress={save}>{pending ? 'Saving…' : 'Save goal'}</Button>
      {initial ? <Button variant="ghost" disabled={pending} onPress={() => onSave(null)}>Clear goal</Button> : null}
      {onCancel ? <Button variant="ghost" onPress={onCancel}>Cancel</Button> : null}
    </>
  );
}

const bmiLabels: Record<ReturnType<typeof bmiCategory>, string> = {
  underweight: 'Underweight',
  healthy: 'Healthy range',
  overweight: 'Overweight',
  obese: 'Obese',
};



const styles = StyleSheet.create({
  header: { minWidth: 0, gap: spacing.xs },
  sectionTitle: { minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  compositionRow: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  compositionStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  segments: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.pill },
  segment: { flex: 1, minWidth: 0, minHeight: 42, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  compositionHeading: { minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  gaugeWrap: { minWidth: 0, gap: spacing.sm },
  gaugeTrack: { height: 12, borderRadius: radius.pill, overflow: 'hidden', justifyContent: 'center' },
  gaugeHealthy: { position: 'absolute', top: 0, bottom: 0 },
  gaugePin: { position: 'absolute', width: 4, top: -2, bottom: -2, borderRadius: 2, marginLeft: -2 },
  gaugeLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  goalValue: { fontSize: 32, lineHeight: 36 },
  formula: { fontVariant: ['tabular-nums'] },
  metricValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  modeRow: { flexDirection: 'row', gap: spacing.xs },
  modeOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preset: { flexGrow: 1, flexBasis: 96, minWidth: 0, minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: 2 },
  goalFields: { flexDirection: 'row', gap: spacing.sm },
  goalField: { flex: 1, minWidth: 0 },
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
