import { Ionicons } from '@expo/vector-icons';
import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { HeaderNavigationButton } from '@/components/header-navigation-button';
import { AppText, Button, Card, ErrorState, Field, LoadingState, ProgressBar, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ExerciseMedia } from '@/features/exercises/components/exercise-media';
import { WorkoutSetEditor } from '@/features/workouts/components/workout-set-editor';
import type { PreviousPerformance, WorkoutSet } from '@/features/workouts/api/workouts';
import { useAddSet, useCompleteWorkout, useDiscardWorkout, useRemoveSet, useSkipExercise, useSkipSet, useUpdateSet, useUpdateWorkoutExercise, useWorkout } from '@/features/workouts/hooks/use-workout';
import { recommendProgressiveOverload } from '@/features/workouts/services/progressive-overload';
import { initialWorkoutExerciseId, resolveWorkoutExercise } from '@/features/workouts/services/exercise-selection';
import { calculateWorkoutVolume } from '@/features/workouts/services/workout-math';
import { useAppTheme } from '@/hooks/use-app-theme';
import { kgToLb } from '@/lib/units';
import { useActiveWorkoutStore } from '@/store/active-workout-store';

type WorkoutView = 'focus' | 'overview';

export default function ActiveWorkoutScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? '';
  const { colors } = useAppTheme();
  const query = useWorkout(id);
  const update = useUpdateSet(id);
  const add = useAddSet(id);
  const remove = useRemoveSet(id);
  const updateExercise = useUpdateWorkoutExercise(id);
  const skipSet = useSkipSet(id);
  const skipExercise = useSkipExercise(id);
  const complete = useCompleteWorkout();
  const discard = useDiscardWorkout();
  const clear = useActiveWorkoutStore((state) => state.clear);
  const begin = useActiveWorkoutStore((state) => state.begin);
  const startRestTimer = useActiveWorkoutStore((state) => state.startRestTimer);
  const clearRestTimer = useActiveWorkoutStore((state) => state.clearRestTimer);
  const restTimerEndsAt = useActiveWorkoutStore((state) => state.restTimerEndsAt);
  const [now, setNow] = useState(Date.now());
  const [view, setView] = useState<WorkoutView>('focus');
  const [selection, setSelection] = useState<{ workoutId: string; exerciseId: string } | null>(null);
  const pendingSaves = useRef(new Set<Promise<unknown>>());

  useEffect(() => {
    if (id) begin(id);
  }, [begin, id]);

  useEffect(() => {
    if (!restTimerEndsAt) return undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= restTimerEndsAt) clearRestTimer();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [clearRestTimer, restTimerEndsAt]);

  useEffect(() => {
    if (query.data?.status && query.data.status !== 'in_progress') clear();
  }, [clear, query.data?.status]);

  const orderedExercises = useMemo(
    () => [...(query.data?.workout_session_exercises ?? [])].sort((a, b) => a.exercise_index - b.exercise_index),
    [query.data?.workout_session_exercises],
  );
  const initialExerciseRef = useRef<{ workoutId: string; exerciseId: string | null } | null>(null);
  if (initialExerciseRef.current?.workoutId !== id && query.data) {
    initialExerciseRef.current = {
      workoutId: id,
      exerciseId: initialWorkoutExerciseId(orderedExercises),
    };
  }
  const activeExerciseId = selection?.workoutId === id ? selection.exerciseId : initialExerciseRef.current?.exerciseId;
  const activeExercise = resolveWorkoutExercise(orderedExercises, activeExerciseId);
  const activeIndex = activeExercise ? orderedExercises.findIndex((exercise) => exercise.id === activeExercise.id) : -1;

  if (query.isLoading) return <><Stack.Screen options={{ headerShown: false }} /><Screen safeEdges={['top', 'left', 'right', 'bottom']}><LoadingState label="Recovering workout…" /></Screen></>;
  if (query.isError || !query.data) return <><Stack.Screen options={{ headerShown: false }} /><Screen safeEdges={['top', 'left', 'right', 'bottom']}><ErrorState message={query.error?.message ?? 'Workout not found'} onRetry={() => query.refetch()} /><Button variant="secondary" onPress={() => { clear(); router.replace('/(tabs)/today'); }}>Back to Today</Button></Screen></>;

  const workout = query.data;
  if (workout.status !== 'in_progress') {
    const wasCompleted = workout.status === 'completed';
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen safeEdges={['top', 'left', 'right', 'bottom']} contentContainerStyle={styles.closedSession}>
          <View style={[styles.closedIcon, { backgroundColor: colors.raised }]}><Ionicons name={wasCompleted ? 'checkmark-circle-outline' : 'close-circle-outline'} color={colors.primary} size={34} /></View>
          <AppText variant="title" style={styles.closedTitle}>{wasCompleted ? 'Workout complete' : 'Workout discarded'}</AppText>
          <AppText color={colors.muted} style={styles.closedTitle}>{wasCompleted ? 'This session is already saved. Open its summary or return to Today.' : 'This session is no longer active. Return to Today to continue your current plan.'}</AppText>
          {wasCompleted ? <Button onPress={() => router.replace({ pathname: '/workout/summary', params: { id } })}>View summary</Button> : null}
          <Button variant={wasCompleted ? 'secondary' : 'primary'} onPress={() => router.replace('/(tabs)/today')}>Back to Today</Button>
        </Screen>
      </>
    );
  }
  const allSets = orderedExercises.flatMap((exercise) => exercise.workout_sets);
  const normalizedSets = allSets.map((set) => ({ weightKg: set.weight_kg, reps: set.reps, completed: Boolean(set.completed_at), type: set.set_type }));
  const completedSets = allSets.filter((set) => Boolean(set.completed_at)).length;
  const skippedSets = allSets.filter((set) => !set.completed_at && Boolean(set.skipped_at)).length;
  // Skipped sets are settled, so finishing should not count them as left undone.
  const incompleteSets = allSets.length - completedSets - skippedSets;
  const volume = calculateWorkoutVolume(normalizedSets);
  const imperial = workout.preferredUnits === 'imperial';
  const restSeconds = restTimerEndsAt ? Math.max(0, Math.ceil((restTimerEndsAt - now) / 1000)) : 0;
  const writesPending = update.isPending || add.isPending || remove.isPending || updateExercise.isPending;
  const requestError = update.error ?? add.error ?? remove.error ?? updateExercise.error ?? complete.error ?? discard.error;

  function saveSet(setId: string, values: Partial<WorkoutSet>, justCompleted?: boolean) {
    const save = update.mutateAsync({ id: setId, values });
    pendingSaves.current.add(save);
    save.then(
      () => {
        pendingSaves.current.delete(save);
        if (justCompleted) {
          const prescription = activeExercise ? workout.prescriptionByExercise[activeExercise.exerciseKey] : null;
          startRestTimer(prescription?.rest_seconds ?? 90);
        }
      },
      () => pendingSaves.current.delete(save),
    );
    return save;
  }

  async function finish() {
    Keyboard.dismiss();
    const saves = await Promise.allSettled([...pendingSaves.current]);
    if (saves.some((result) => result.status === 'rejected') || update.isError) return;
    try {
      await complete.mutateAsync({ id });
      clear();
      router.replace({ pathname: '/workout/summary', params: { id } });
    } catch {
      // The request error stays visible while the workout remains recoverable.
    }
  }

  function requestFinish() {
    if (!incompleteSets) {
      void finish();
      return;
    }
    Alert.alert(
      `Finish with ${incompleteSets} ${incompleteSets === 1 ? 'set' : 'sets'} left?`,
      'Unfinished sets will stay unlogged. You can go back and finish them first.',
      [
        { text: 'Keep training', style: 'cancel' },
        { text: 'Finish anyway', onPress: () => void finish() },
      ],
    );
  }

  async function discardSession() {
    try {
      await discard.mutateAsync(id);
      clear();
      router.replace('/(tabs)/workouts');
    } catch {
      // The request error is rendered below.
    }
  }

  function confirmDiscard() {
    Alert.alert('Discard workout?', 'All logged sets from this workout will be removed. This cannot be undone.', [
      { text: 'Keep workout', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discardSession() },
    ]);
  }

  function selectExercise(index: number) {
    const exercise = orderedExercises[index];
    if (!exercise) return;
    Keyboard.dismiss();
    setSelection({ workoutId: id, exerciseId: exercise.id });
    setView('focus');
  }

  const footer = (
    <View style={styles.footer}>
      {restSeconds > 0 ? (
        <View style={[styles.restBar, { backgroundColor: colors.raised }]}>
          <View style={styles.restCopy}>
            <Ionicons name="timer-outline" color={colors.primary} size={22} />
            <View>
              <AppText variant="caption" color={colors.muted}>Rest timer</AppText>
              <AppText variant="heading" style={styles.tabular}>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}</AppText>
            </View>
          </View>
          <View style={styles.restActions}>
            <Pressable accessibilityLabel="Add 15 seconds to rest" onPress={() => startRestTimer(restSeconds + 15)} style={styles.restButton}><AppText variant="caption" color={colors.primary}>+15s</AppText></Pressable>
            <Pressable accessibilityLabel="Skip rest timer" onPress={clearRestTimer} style={styles.restButton}><AppText variant="caption">Skip</AppText></Pressable>
          </View>
        </View>
      ) : null}
      {view === 'overview' ? (
        <Button disabled={complete.isPending || writesPending} onPress={requestFinish}>
          {complete.isPending ? 'Finishing…' : writesPending ? 'Saving…' : 'Finish workout'}
        </Button>
      ) : (
        <View style={styles.navRow}>
          <Button variant="secondary" style={styles.navButton} disabled={activeIndex <= 0} onPress={() => selectExercise(activeIndex - 1)}>
            Previous
          </Button>
          <Button style={styles.navButton} onPress={() => activeIndex >= orderedExercises.length - 1 ? setView('overview') : selectExercise(activeIndex + 1)}>
            {activeIndex >= orderedExercises.length - 1 ? 'Review workout' : 'Next exercise'}
          </Button>
        </View>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <Screen safeEdges={['top', 'left', 'right', 'bottom']} footer={footer} contentContainerStyle={styles.screenContent}>
        <View style={styles.topBar}>
          <HeaderNavigationButton accessibilityLabel="Minimize workout" icon="chevron-down" onPress={() => router.replace('/(tabs)/today')} />
          <View style={styles.topBarCopy}>
            <AppText variant="caption" color={colors.primary}>Workout in progress</AppText>
            <AppText numberOfLines={1} style={styles.workoutName}>{workout.name}</AppText>
          </View>
          <HeaderNavigationButton
            accessibilityLabel={view === 'overview' ? 'Return to current exercise' : 'Review workout'}
            icon={view === 'overview' ? 'barbell-outline' : 'list-outline'}
            onPress={() => setView((current) => current === 'focus' ? 'overview' : 'focus')}
          />
        </View>

        <View style={styles.progressHeader}>
          <AppText variant="caption" color={colors.muted}>{completedSets} of {allSets.length} sets complete{skippedSets ? ` · ${skippedSets} skipped` : ''}</AppText>
          <AppText variant="caption" color={colors.muted}>{Math.round(imperial ? kgToLb(volume) : volume)} {imperial ? 'lb' : 'kg'} volume</AppText>
        </View>
        <ProgressBar label={`${completedSets} of ${allSets.length} workout sets complete`} value={allSets.length ? (completedSets + skippedSets) / allSets.length * 100 : 0} />

        {view === 'overview' ? (
          <WorkoutOverview
            exercises={orderedExercises}
            onDiscard={confirmDiscard}
            onSelect={(exerciseId) => {
              setSelection({ workoutId: id, exerciseId });
              setView('focus');
            }}
          />
        ) : activeExercise ? (
          <FocusedExercise
            exercise={activeExercise}
            exerciseIndex={activeIndex}
            exerciseCount={orderedExercises.length}
            imperial={imperial}
            prescription={workout.prescriptionByExercise[activeExercise.exerciseKey]}
            previous={workout.previousByExercise[activeExercise.exerciseKey] ?? null}
            addSetPending={add.isPending}
            onAddSet={() => {
              const nextIndex = activeExercise.workout_sets.reduce((highest, set) => Math.max(highest, set.set_index), -1) + 1;
              add.mutate({ exerciseId: activeExercise.id, nextIndex });
            }}
            onRemoveSet={(setId) => Alert.alert('Remove set?', 'This set will be removed from the workout.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(setId) },
            ])}
            onSaveSet={saveSet}
            onSaveNotes={(notes) => updateExercise.mutate({ id: activeExercise.id, notes: notes.trim() || null })}
            onSkipExercise={() => Alert.alert('Skip this exercise?', 'Its unlogged sets are marked skipped. They stay out of your volume and history, and you can still log them.', [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Skip', onPress: () => skipExercise.mutate(activeExercise.id) },
            ])}
            onSkipSet={(setId, skipped) => skipSet.mutate({ id: setId, skipped })}
            skipPending={skipExercise.isPending || skipSet.isPending}
            workoutId={id}
          />
        ) : (
          <Card><AppText variant="heading">No exercises in this workout</AppText><AppText color={colors.muted}>Finish or discard this empty session from the workout overview.</AppText></Card>
        )}

        {requestError ? <AppText color={colors.danger}>{requestError.message}</AppText> : null}
      </Screen>
    </>
  );
}

function FocusedExercise({ exercise, exerciseIndex, exerciseCount, imperial, prescription, previous, addSetPending, onAddSet, onRemoveSet, onSaveSet, onSaveNotes, onSkipExercise, onSkipSet, skipPending, workoutId }: {
  exercise: NonNullable<ReturnType<typeof useWorkout>['data']>['workout_session_exercises'][number];
  exerciseIndex: number;
  exerciseCount: number;
  imperial: boolean;
  prescription: NonNullable<ReturnType<typeof useWorkout>['data']>['prescriptionByExercise'][string] | undefined;
  previous: PreviousPerformance | null;
  addSetPending: boolean;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onSaveSet: (setId: string, values: Partial<WorkoutSet>, justCompleted?: boolean) => Promise<unknown>;
  onSaveNotes: (notes: string) => void;
  onSkipExercise: () => void;
  onSkipSet: (setId: string, skipped: boolean) => void;
  skipPending: boolean;
  workoutId: string;
}) {
  const { colors } = useAppTheme();
  const sets = [...exercise.workout_sets].sort((a, b) => a.set_index - b.set_index);
  const currentSet = sets.find((set) => !set.completed_at);
  const completed = sets.filter((set) => set.completed_at).length;
  const previousGuidance = recommendProgressiveOverload(
    previous?.sets.map((set) => ({ reps: set.reps, weightKg: set.weight_kg, rir: set.rir, rpe: set.rpe, completed: Boolean(set.completed_at), type: set.set_type })) ?? [],
    prescription?.rep_min ?? null,
    prescription?.rep_max ?? null,
    prescription?.target_rir ?? null,
    prescription?.target_rpe ?? null,
    prescription?.target_sets ?? null,
  );
  const previousWorkingSets = previous?.sets.filter((set) => set.set_type === 'working') ?? [];
  const representativePrevious = previousWorkingSets.reduce<typeof previousWorkingSets[number] | null>((best, set) => {
    if (!best) return set;
    if ((set.weight_kg ?? 0) !== (best.weight_kg ?? 0)) return (set.weight_kg ?? 0) > (best.weight_kg ?? 0) ? set : best;
    return (set.reps ?? 0) > (best.reps ?? 0) ? set : best;
  }, null);
  const previousWeight = representativePrevious?.weight_kg === null || representativePrevious?.weight_kg === undefined
    ? null
    : (imperial ? kgToLb(representativePrevious.weight_kg) : representativePrevious.weight_kg).toFixed(1).replace(/\.0$/, '');

  return (
    <View style={styles.focusWrap}>
      <Card style={styles.exerciseCard}>
        <View style={styles.exerciseHeading}>
          <ExerciseMedia compact imageSource={exercise.exercise.image_source ?? null} gifSource={exercise.exercise.gif_source ?? null} />
          <View style={styles.exerciseTitle}>
            <AppText variant="eyebrow" color={colors.primary}>Exercise {exerciseIndex + 1} of {exerciseCount}</AppText>
            <AppText variant="title" style={styles.exerciseName}>{exercise.exercise.name}</AppText>
            <AppText variant="caption" color={colors.muted}>{[exercise.exercise.target, exercise.exercise.equipment].filter(Boolean).join(' · ') || 'Strength exercise'}</AppText>
          </View>
        </View>

        <View style={styles.exerciseProgress}>
          <View style={styles.exerciseCounts}>
            <AppText variant="caption" color={colors.muted}>{completed}/{sets.length} sets</AppText>
            {prescription?.rep_max ? <AppText variant="caption" color={colors.muted}>Target {prescription.rep_min ?? prescription.rep_max}–{prescription.rep_max} reps</AppText> : null}
          </View>
          <Link href={{ pathname: '/workout/replace', params: { workoutId, sessionExerciseId: exercise.id } }} asChild>
            <Pressable accessibilityLabel={`Replace ${exercise.exercise.name}`} style={[styles.swapButton, { backgroundColor: colors.raised }]}>
              <Ionicons name="swap-horizontal" color={colors.primary} size={19} />
              <AppText variant="caption" color={colors.primary}>Swap</AppText>
            </Pressable>
          </Link>
        </View>

        {previous ? (
          <View style={[styles.lastTime, { backgroundColor: colors.raised }]}>
            <Ionicons name="time-outline" size={21} color={colors.primary} />
            <View style={styles.flex}>
              <AppText variant="caption" color={colors.muted}>Last performance</AppText>
              <AppText>{previousWeight === null ? 'Bodyweight' : `${previousWeight} ${imperial ? 'lb' : 'kg'}`} {representativePrevious?.reps === null || representativePrevious?.reps === undefined ? '' : `× ${representativePrevious.reps} reps`}</AppText>
            </View>
          </View>
        ) : <AppText variant="caption" color={colors.muted}>No previous performance yet. This workout becomes your baseline.</AppText>}

        {previousGuidance.action !== 'insufficient_data' ? (
          <View style={[styles.loadSignal, { backgroundColor: colors.background }]}> 
            <Ionicons name={guidanceIcon(previousGuidance.action)} color={guidanceColor(previousGuidance.action, colors)} size={20} />
            <View style={styles.flex}>
              <AppText variant="caption" color={guidanceColor(previousGuidance.action, colors)}>Suggested today · {guidanceLabel(previousGuidance.action)}</AppText>
              <AppText variant="caption" color={colors.muted}>{previousGuidance.reason}</AppText>
            </View>
          </View>
        ) : null}
      </Card>

      <View style={styles.setList}>
        {sets.map((set) => (
          <WorkoutSetEditor
            imperial={imperial}
            isCurrent={set.id === currentSet?.id}
            key={set.id}
            onRemove={() => onRemoveSet(set.id)}
            onSkip={(skipped) => onSkipSet(set.id, skipped)}
            onSave={(values, justCompleted) => onSaveSet(set.id, values, justCompleted)}
            previous={representativePrevious ? { weightKg: representativePrevious.weight_kg, reps: representativePrevious.reps } : null}
            restSeconds={prescription?.rest_seconds ?? 90}
            set={set}
          />
        ))}
        <Button variant="secondary" disabled={addSetPending} onPress={onAddSet}>{addSetPending ? 'Adding set…' : 'Add another set'}</Button>
        <Button variant="ghost" disabled={skipPending} onPress={onSkipExercise}>Skip this exercise</Button>
      </View>

      <Card>
        <AppText variant="heading">Exercise notes</AppText>
        <Field
          label="Notes for this workout"
          defaultValue={exercise.notes ?? ''}
          multiline
          onEndEditing={(event) => onSaveNotes(event.nativeEvent.text)}
          placeholder="Form cues, machine settings, pain, or anything to remember"
        />
      </Card>

    </View>
  );
}

type GuidanceAction = Exclude<ReturnType<typeof recommendProgressiveOverload>['action'], 'insufficient_data'>;

function guidanceLabel(action: GuidanceAction) {
  if (action === 'increase_load') return 'Increase';
  if (action === 'reduce_load') return 'Reduce';
  return 'Hold';
}

function guidanceIcon(action: GuidanceAction): keyof typeof Ionicons.glyphMap {
  if (action === 'increase_load') return 'arrow-up-circle-outline';
  if (action === 'reduce_load') return 'arrow-down-circle-outline';
  return 'remove-circle-outline';
}

function guidanceColor(action: GuidanceAction, colors: ReturnType<typeof useAppTheme>['colors']) {
  return action === 'reduce_load' ? colors.danger : colors.primary;
}

function WorkoutOverview({ exercises, onSelect, onDiscard }: {
  exercises: NonNullable<ReturnType<typeof useWorkout>['data']>['workout_session_exercises'];
  onSelect: (exerciseId: string) => void;
  onDiscard: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.overview}>
      <View style={styles.overviewHeading}>
        <AppText variant="eyebrow" color={colors.primary}>Workout overview</AppText>
        <AppText variant="title">Review your session</AppText>
        <AppText color={colors.muted}>Jump to any exercise or finish from the button below.</AppText>
      </View>
      {exercises.map((exercise, index) => {
        const completed = exercise.workout_sets.filter((set) => set.completed_at).length;
        const total = exercise.workout_sets.length;
        return (
          <Pressable
            accessibilityLabel={`Open ${exercise.exercise.name}, ${completed} of ${total} sets complete`}
            accessibilityRole="button"
            key={exercise.id}
            onPress={() => onSelect(exercise.id)}
            style={({ pressed }) => [styles.overviewRow, { backgroundColor: colors.surface, borderColor: colors.line, opacity: pressed ? 0.72 : 1 }]}>
            <View style={[styles.overviewNumber, { backgroundColor: completed === total && total > 0 ? colors.primary : colors.raised }]}>
              {completed === total && total > 0 ? <Ionicons name="checkmark" color={colors.onPrimary} size={19} /> : <AppText variant="caption">{index + 1}</AppText>}
            </View>
            <ExerciseMedia compact size={56} imageSource={exercise.exercise.image_source ?? null} gifSource={exercise.exercise.gif_source ?? null} />
            <View style={styles.overviewCopy}>
              <AppText variant="heading" numberOfLines={2}>{exercise.exercise.name}</AppText>
              <AppText variant="caption" color={colors.muted}>{completed} of {total} sets complete</AppText>
            </View>
            <Ionicons name="chevron-forward" color={colors.muted} size={21} />
          </Pressable>
        );
      })}
      {!exercises.length ? <Card><AppText color={colors.muted}>This session has no exercises.</AppText></Card> : null}
      <Button variant="danger" onPress={onDiscard}>Discard workout</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: spacing.md },
  topBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topBarCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
  workoutName: { fontWeight: '800', maxWidth: '100%' },
  progressHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  footer: { gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  restBar: { minHeight: 64, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  restCopy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  restActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  restButton: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  tabular: { fontVariant: ['tabular-nums'] },
  navRow: { flexDirection: 'row', gap: spacing.sm },
  navButton: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  focusWrap: { gap: spacing.lg, width: '100%' },
  exerciseCard: { overflow: 'hidden' },
  exerciseHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exerciseTitle: { flex: 1, minWidth: 0, gap: spacing.xs },
  exerciseName: { fontSize: 26, lineHeight: 30 },
  swapButton: { minHeight: 44, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, flexShrink: 0 },
  exerciseProgress: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  exerciseCounts: { minWidth: 0, flexShrink: 1, gap: spacing.xs },
  lastTime: { minHeight: 64, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  setList: { gap: spacing.sm, width: '100%' },
  loadSignal: { borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  overview: { gap: spacing.md, width: '100%' },
  overviewHeading: { gap: spacing.xs, marginBottom: spacing.sm },
  overviewRow: { minHeight: 78, width: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  overviewNumber: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  overviewCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  closedSession: { justifyContent: 'center' },
  closedIcon: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  closedTitle: { textAlign: 'center' },
});
