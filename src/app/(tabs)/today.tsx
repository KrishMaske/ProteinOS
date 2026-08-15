import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { HeaderNavigationButton } from '@/components/header-navigation-button';
import { AppText, Button, Card, ErrorState, Field, LoadingState, ProgressBar, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ExerciseMedia } from '@/features/exercises/components/exercise-media';
import { pickAndUploadFoodPhoto } from '@/features/nutrition/api/food-photo';
import type { CompositionSummary } from '@/features/progress/services/weekly-body-metrics';
import { useToday } from '@/features/today/hooks/use-today';
import { useCompleteRestDay, useCompleteWorkout, useQuickLogSet, useStartWorkout } from '@/features/workouts/hooks/use-workout';
import { useAppTheme } from '@/hooks/use-app-theme';
import { localDateKey } from '@/lib/date';
import { kgToLb, lbToKg } from '@/lib/units';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { useAuth } from '@/providers/auth-provider';

export default function TodayScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const query = useToday(localDateKey());
  const activeSessionId = query.data?.activeSession?.id ?? '';
  const start = useStartWorkout();
  const quickLog = useQuickLogSet(activeSessionId);
  const complete = useCompleteWorkout();
  const completeRest = useCompleteRestDay();
  const beginWorkout = useActiveWorkoutStore((state) => state.begin);
  const clearWorkout = useActiveWorkoutStore((state) => state.clear);
  const clearPendingSetEdit = useActiveWorkoutStore((state) => state.clearSetEdit);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  if (query.isLoading) return <Screen safeEdges={['top', 'left', 'right']}><LoadingState label="Building today…" /></Screen>;
  if (query.isError) return <Screen safeEdges={['top', 'left', 'right']}><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;

  const data = query.data!;
  const totals = data.nutrition;
  const target = data.target;
  const greeting = data.profile?.display_name ? `Ready, ${data.profile.display_name}?` : 'Make today count.';
  const imperial = data.profile?.preferred_units === 'imperial';
  const latestWeight = data.latestWeight?.weight_kg
    ? imperial
      ? `${kgToLb(Number(data.latestWeight.weight_kg)).toFixed(1)} lb`
      : `${Number(data.latestWeight.weight_kg).toFixed(1)} kg`
    : null;
  const sessionSets = data.activeSession?.workout_session_exercises.flatMap((exercise) =>
    exercise.workout_sets.map((set) => ({ set, exercise })),
  ) ?? [];
  const completedSets = sessionSets.filter(({ set }) => Boolean(set.completed_at)).length;
  const nextSet = sessionSets.find(({ set }) => !set.completed_at);
  const workoutError = start.error ?? quickLog.error ?? complete.error ?? completeRest.error;

  function startTodayWorkout() {
    if (!data.suggestedDay || data.suggestedDay.is_rest_day) return;
    start.mutate({ dayId: data.suggestedDay.id }, {
      onSuccess: (session) => {
        beginWorkout(session.id);
        router.push({ pathname: '/workout/[id]', params: { id: session.id } });
      },
    });
  }

  function finishWorkout() {
    if (!data.activeSession) return;
    complete.mutate({ id: data.activeSession.id }, {
      onSuccess: () => {
        clearWorkout();
        router.push({ pathname: '/workout/summary', params: { id: data.activeSession!.id } });
      },
    });
  }

  async function photographFood() {
    if (!user || openingCamera) return;
    setOpeningCamera(true);
    setCameraError(null);
    try {
      const uploaded = await pickAndUploadFoodPhoto(user.id, 'camera');
      if (uploaded) router.push({ pathname: '/nutrition/scan', params: { path: uploaded } });
    } catch (caught) {
      setCameraError(caught instanceof Error ? caught.message : 'Could not open the camera');
    } finally {
      setOpeningCamera(false);
    }
  }

  return (
    <Screen safeEdges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="eyebrow" color={colors.primary}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}</AppText>
          <AppText variant="title">{greeting}</AppText>
        </View>
        <View style={styles.headerActions}>
          <Link href="/(tabs)/coach" asChild><Pressable accessibilityLabel="Ask Coach" style={[styles.iconButton, { backgroundColor: colors.raised }]}><Ionicons name="sparkles-outline" size={22} color={colors.text} /></Pressable></Link>
          <Link href="/settings" asChild><Pressable accessibilityLabel="Open settings" style={[styles.iconButton, { backgroundColor: colors.raised }]}><Ionicons name="person-outline" size={22} color={colors.text} /></Pressable></Link>
        </View>
      </View>

      <Card style={styles.trainingCard}>
        {data.activeSession ? (
          <>
            <View style={styles.workoutHeading}>
              <View style={styles.flex}>
                <AppText variant="eyebrow" color={colors.primary}>Workout in progress</AppText>
                <AppText variant="heading" numberOfLines={2}>{data.activeSession.name}</AppText>
              </View>
              {sessionSets.length ? <AppText variant="caption" color={colors.muted}>{completedSets}/{sessionSets.length}</AppText> : null}
            </View>
            {sessionSets.length ? <ProgressBar label={`${completedSets} of ${sessionSets.length} sets complete`} value={completedSets / sessionSets.length * 100} /> : null}
            <AppText variant="caption" color={colors.muted}>Started {new Date(data.activeSession.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</AppText>

            {nextSet ? (
              <View style={[styles.nextSet, { backgroundColor: colors.raised }]}>
                <View style={[styles.nextSetIcon, { backgroundColor: colors.primary }]}><AppText variant="caption" color={colors.onPrimary}>{nextSet.set.set_index + 1}</AppText></View>
                <ExerciseMedia compact size={56} imageSource={nextSet.exercise.exercise.image_source ?? null} gifSource={nextSet.exercise.exercise.gif_source ?? null} />
                <View style={styles.nextSetCopy}>
                  <AppText variant="caption" color={colors.muted}>Next set</AppText>
                  <AppText variant="heading" numberOfLines={2}>{nextSet.exercise.exercise.name}</AppText>
                  <AppText variant="caption" color={colors.muted}>{nextSet.set.set_type} set</AppText>
                </View>
              </View>
            ) : sessionSets.length ? (
              <View style={[styles.completeState, { backgroundColor: colors.raised }]}>
                <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
                <View style={styles.flex}><AppText variant="heading">All sets logged</AppText><AppText variant="caption" color={colors.muted}>Review the workout, then finish when you are ready.</AppText></View>
              </View>
            ) : <AppText color={colors.muted}>Open the workout to review this session.</AppText>}

            {nextSet && quickLogOpen ? (
              <QuickSetLogger
                key={nextSet.set.id}
                exerciseName={nextSet.exercise.exercise.name}
                imperial={imperial}
                initialReps={nextSet.set.reps}
                initialWeightKg={nextSet.set.weight_kg}
                pending={quickLog.isPending}
                setNumber={nextSet.set.set_index + 1}
                onCancel={() => setQuickLogOpen(false)}
                onLog={(weightKg, reps) => quickLog.mutateAsync({ setId: nextSet.set.id, weightKg, reps })}
                onLogged={() => {
                  clearPendingSetEdit(nextSet.set.id);
                  setQuickLogOpen(false);
                }}
              />
            ) : null}

            <View style={styles.workoutActions}>
              <Link href={`/workout/${data.activeSession.id}`} asChild><Button style={styles.primaryAction}>{nextSet ? 'Continue workout' : 'Review workout'}</Button></Link>
              {nextSet && !quickLogOpen ? <Button variant="secondary" style={styles.quickAction} onPress={() => setQuickLogOpen(true)}>Quick log</Button> : null}
            </View>
            {!nextSet && sessionSets.length ? <Button accessibilityLabel="Finish workout and advance split" disabled={complete.isPending} onPress={finishWorkout}>{complete.isPending ? 'Finishing…' : 'Finish workout'}</Button> : null}
          </>
        ) : data.suggestedDay?.is_rest_day ? (
          <>
            <View style={[styles.restDayIcon, { backgroundColor: colors.raised }]}><Ionicons name="moon-outline" color={colors.primary} size={25} /></View>
            <AppText variant="eyebrow" color={colors.primary}>Recovery day</AppText>
            <AppText variant="heading">{data.suggestedDay.name}</AppText>
            <AppText color={colors.muted}>Recovery is part of the plan. Advance the split when this rest day is complete.</AppText>
            <Button accessibilityLabel="Complete rest day and advance split" disabled={completeRest.isPending} onPress={() => completeRest.mutate(data.suggestedDay!.id)}>{completeRest.isPending ? 'Advancing…' : 'Complete rest day'}</Button>
          </>
        ) : data.suggestedDay ? (
          <>
            <AppText variant="eyebrow" color={colors.primary}>Today’s workout</AppText>
            <AppText variant="heading">{data.suggestedDay.name}</AppText>
            <Button accessibilityLabel={`Start ${data.suggestedDay.name}`} disabled={start.isPending} onPress={startTodayWorkout}>{start.isPending ? 'Preparing sets…' : 'Start workout'}</Button>
          </>
        ) : (
          <>
            <AppText variant="eyebrow" color={colors.primary}>Training plan</AppText>
            <AppText variant="heading">No active routine</AppText>
            <AppText color={colors.muted}>Import your gym file or build a routine to get a workout on Today.</AppText>
            <Link href="/routine/import" asChild><Button>Import gym file</Button></Link>
            <Link href="/routine/new" asChild><Button variant="secondary">Create a plan</Button></Link>
          </>
        )}
        {workoutError ? <AppText color={colors.danger}>{workoutError.message}</AppText> : null}
      </Card>

      <Card>
        <CardTitleLink title="Nutrition" href="/(tabs)/nutrition" />
        <NutritionProgress label="Calories" value={totals?.calories ?? 0} target={target?.calories ?? 0} unit="kcal" />
        <NutritionProgress label="Protein" value={totals?.protein_grams ?? 0} target={target?.protein_grams ?? 0} unit="g" />
        <AppText variant="caption" color={colors.muted}>{Math.round(totals?.carbohydrate_grams ?? 0)}g carbs · {Math.round(totals?.fat_grams ?? 0)}g fat</AppText>
        <View style={styles.nutritionActions}>
          <Button style={styles.nutritionAction} disabled={openingCamera} onPress={() => void photographFood()}>{openingCamera ? 'Opening…' : 'Camera'}</Button>
          <Link href="/nutrition/foods" asChild><Button variant="secondary" style={styles.nutritionAction}>Saved foods</Button></Link>
        </View>
        {cameraError ? <AppText variant="caption" color={colors.danger}>{cameraError}</AppText> : null}
      </Card>

      {data.composition ? <CompositionCard summary={data.composition} imperial={imperial} /> : null}

      <View style={styles.secondaryActions}>
        <Link href="/progress/log" asChild><Button variant="secondary" style={styles.secondaryButton}>Log weight</Button></Link>
        <Link href="/(tabs)/progress" asChild><Button variant="ghost" style={styles.secondaryButton}>{latestWeight ? `Latest · ${latestWeight}` : 'View progress'}</Button></Link>
      </View>
    </Screen>
  );
}

function QuickSetLogger({ exerciseName, imperial, initialReps, initialWeightKg, pending, setNumber, onLog, onLogged, onCancel }: {
  exerciseName: string;
  imperial: boolean;
  initialReps: number | null;
  initialWeightKg: number | null;
  pending: boolean;
  setNumber: number;
  onLog: (weightKg: number | null, reps: number) => Promise<unknown>;
  onLogged: () => void;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();
  const [weight, setWeight] = useState(initialWeightKg === null ? '' : (imperial ? kgToLb(Number(initialWeightKg)) : Number(initialWeightKg)).toFixed(1).replace(/\.0$/, ''));
  const [reps, setReps] = useState(initialReps?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const normalizedWeight = weight.trim() === '' ? null : Number(weight.replace(',', '.'));
    const normalizedReps = Number(reps);
    if (normalizedWeight !== null && (!Number.isFinite(normalizedWeight) || normalizedWeight < 0)) {
      setError('Enter a valid weight or leave it blank for bodyweight.');
      return;
    }
    if (!Number.isInteger(normalizedReps) || normalizedReps <= 0) {
      setError('Reps must be a whole number greater than zero.');
      return;
    }
    setError(null);
    try {
      await onLog(normalizedWeight === null ? null : imperial ? lbToKg(normalizedWeight) : normalizedWeight, normalizedReps);
      Keyboard.dismiss();
      onLogged();
    } catch {
      // The workout card renders the mutation error.
    }
  }

  return (
    <View style={[styles.quickLog, { borderColor: colors.line }]}>
      <View style={styles.quickLogHeader}>
        <View style={styles.flex}>
          <AppText variant="caption" color={colors.primary}>Quick log · set {setNumber}</AppText>
          <AppText numberOfLines={1}>{exerciseName}</AppText>
        </View>
        <HeaderNavigationButton mode="close" onPress={onCancel} />
      </View>
      <View style={styles.quickFields}>
        <Field containerStyle={styles.quickField} label={imperial ? 'Weight (lb)' : 'Weight (kg)'} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="Bodyweight" returnKeyType="next" />
        <Field containerStyle={styles.quickField} label="Reps" value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="0" returnKeyType="done" onSubmitEditing={() => void submit()} />
      </View>
      {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
      <Button accessibilityLabel={`Complete set ${setNumber} of ${exerciseName}`} disabled={pending} onPress={() => void submit()}>{pending ? 'Saving set…' : 'Save & complete set'}</Button>
    </View>
  );
}

/** Signed change with the arrow the user cares about: down is progress on a cut. */
function DeltaNote({ change, unit }: { change: number | null; unit: string }) {
  const { colors } = useAppTheme();
  if (change === null) return <AppText variant="caption" color={colors.muted}>First week</AppText>;
  if (Math.abs(change) < 0.05) return <AppText variant="caption" color={colors.muted}>Holding</AppText>;
  return (
    <AppText variant="caption" color={colors.muted}>
      {change > 0 ? '+' : ''}{change.toFixed(1)}{unit} vs last week
    </AppText>
  );
}

/**
 * One shared card title so every card on Today reads the same. The title itself is the
 * link, rather than a separate word beside it.
 */
function CardTitleLink({ title, href, subtitle }: { title: string; href: Parameters<typeof Link>[0]['href']; subtitle?: string }) {
  const { colors } = useAppTheme();
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open ${title}`} style={({ pressed }) => [styles.cardTitleRow, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={styles.flex}>
          <AppText variant="heading">{title}</AppText>
          {subtitle ? <AppText variant="caption" color={colors.muted}>{subtitle}</AppText> : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
    </Link>
  );
}

function CompositionCard({ summary, imperial }: { summary: CompositionSummary; imperial: boolean }) {
  const { colors } = useAppTheme();
  const { current, bmiChange, bodyFatChange } = summary;

  return (
    <Card>
      <CardTitleLink
        title="Composition"
        href={{ pathname: '/(tabs)/progress', params: { segment: 'composition' } }}
        subtitle={current.readings === 1 ? 'From 1 log this week' : `Averaged from ${current.readings} logs this week`}
      />
      <View style={styles.compositionRow}>
        {current.bmi !== null ? (
          <View style={[styles.compositionStat, { backgroundColor: colors.raised }]}>
            <AppText variant="caption" color={colors.muted}>BMI</AppText>
            <AppText variant="heading">{current.bmi.toFixed(1)}</AppText>
            <DeltaNote change={bmiChange} unit="" />
          </View>
        ) : null}
        {current.fat ? (
          <View style={[styles.compositionStat, { backgroundColor: colors.raised }]}>
            <AppText variant="caption" color={colors.muted}>Body fat</AppText>
            <AppText variant="heading">{current.fat.percent.toFixed(1)}%</AppText>
            <DeltaNote change={bodyFatChange} unit=" pts" />
          </View>
        ) : null}
        {current.fat?.leanMassKg !== null && current.fat?.leanMassKg !== undefined ? (
          <View style={[styles.compositionStat, { backgroundColor: colors.raised }]}>
            <AppText variant="caption" color={colors.muted}>Lean mass</AppText>
            <AppText variant="heading">
              {Math.round(imperial ? kgToLb(current.fat.leanMassKg) : current.fat.leanMassKg)} {imperial ? 'lb' : 'kg'}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {Math.round(imperial ? kgToLb(current.fat.fatMassKg ?? 0) : (current.fat.fatMassKg ?? 0))} {imperial ? 'lb' : 'kg'} fat
            </AppText>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function NutritionProgress({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.progress}><View style={styles.progressCopy}><AppText variant="caption">{label}</AppText><AppText variant="caption" color={colors.muted}>{Math.round(value)} / {Math.round(target)} {unit}</AppText></View><ProgressBar label={`${label}: ${Math.round(value)} of ${Math.round(target)} ${unit}`} value={target > 0 ? value / target * 100 : 0} /></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  headerActions: { flexDirection: 'row', gap: spacing.sm, flexShrink: 0 },
  iconButton: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  trainingCard: { overflow: 'hidden' },
  workoutHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  nextSet: { minHeight: 78, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nextSetIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nextSetCopy: { flex: 1, minWidth: 0, gap: 1 },
  completeState: { minHeight: 74, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  workoutActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  primaryAction: { flexGrow: 2, flexBasis: 180, minWidth: 0 },
  quickAction: { flexGrow: 1, flexBasis: 110, minWidth: 0 },
  quickLog: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.md, width: '100%' },
  quickLogHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickField: { flexGrow: 1, flexBasis: 120, minWidth: 0 },
  restDayIcon: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  progress: { gap: spacing.sm },
  progressCopy: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  nutritionActions: { flexDirection: 'row', gap: spacing.sm },
  nutritionAction: { flex: 1, minHeight: 46, paddingHorizontal: spacing.md },
  compositionRow: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  compositionStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryButton: { flexGrow: 1, flexBasis: 150, minWidth: 0 },
  cardTitleRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  flex: { flex: 1, minWidth: 0 },
});
