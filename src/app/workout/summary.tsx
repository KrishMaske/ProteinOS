import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { HeaderNavigationButton } from '@/components/header-navigation-button';
import { AppText, Button, Card, ErrorState, LoadingState, Screen } from '@/components/ui';
import { GymPicker } from '@/features/gyms/components/gym-picker';
import { radius, spacing } from '@/constants/tokens';
import { useWorkout } from '@/features/workouts/hooks/use-workout';
import { recommendProgressiveOverload } from '@/features/workouts/services/progressive-overload';
import { calculateWorkoutVolume, countWorkingSets } from '@/features/workouts/services/workout-math';
import { useAppTheme } from '@/hooks/use-app-theme';
import { kgToLb } from '@/lib/units';

export default function WorkoutSummaryScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const query = useWorkout(id);

  if (query.isLoading) return <><Stack.Screen options={{ headerShown: false }} /><Screen safeEdges={['top', 'left', 'right', 'bottom']}><LoadingState label="Building your workout recap…" /></Screen></>;
  if (query.isError || !query.data) return <><Stack.Screen options={{ headerShown: false }} /><Screen safeEdges={['top', 'left', 'right', 'bottom']}><ErrorState message={query.error?.message ?? 'Workout not found'} onRetry={() => query.refetch()} /></Screen></>;

  const workout = query.data;
  const exercises = [...workout.workout_session_exercises].sort((a, b) => a.exercise_index - b.exercise_index);
  const sets = exercises.flatMap((exercise) => exercise.workout_sets);
  const normalized = sets.map((set) => ({ weightKg: set.weight_kg, reps: set.reps, completed: Boolean(set.completed_at), type: set.set_type }));
  const workingSets = countWorkingSets(normalized);
  const completedSets = sets.filter((set) => set.completed_at).length;
  const records = exercises.filter((exercise) => {
    const completedLoads = exercise.workout_sets.filter((set) => set.completed_at).map((set) => set.weight_kg ?? 0);
    const currentBest = completedLoads.length ? Math.max(...completedLoads) : 0;
    const priorBest = Math.max(0, ...(workout.previousByExercise[exercise.exerciseKey]?.sets.map((set) => set.weight_kg ?? 0) ?? []));
    return currentBest > priorBest;
  });
  const volumeKg = calculateWorkoutVolume(normalized);
  const imperial = workout.preferredUnits === 'imperial';
  const volume = Math.round(imperial ? kgToLb(volumeKg) : volumeKg);
  const durationMinutes = Math.max(0, Math.round((workout.duration_seconds ?? 0) / 60));
  const loadGuidance = exercises.flatMap((exercise) => {
    const prescription = workout.prescriptionByExercise[exercise.exerciseKey];
    const recommendation = recommendProgressiveOverload(
      exercise.workout_sets.map((set) => ({ reps: set.reps, weightKg: set.weight_kg, rir: set.rir, rpe: set.rpe, completed: Boolean(set.completed_at), type: set.set_type })),
      prescription?.rep_min ?? null,
      prescription?.rep_max ?? null,
      prescription?.target_rir ?? null,
      prescription?.target_rpe ?? null,
      prescription?.target_sets ?? null,
    );
    return recommendation.action === 'insufficient_data' ? [] : [{ exercise, recommendation }];
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <Screen safeEdges={['top', 'left', 'right', 'bottom']} contentContainerStyle={styles.screen}>
        <View style={styles.topBar}>
          <HeaderNavigationButton onPress={() => router.replace('/(tabs)/workouts')} />
          <AppText variant="caption" color={colors.muted}>Workout summary</AppText>
          <View style={styles.navigationSpacer} />
        </View>

        <View style={styles.hero}>
          <View style={[styles.completeIcon, { backgroundColor: colors.primary }]}><Ionicons name="checkmark" color={colors.onPrimary} size={32} /></View>
          <AppText variant="eyebrow" color={colors.primary}>Workout complete</AppText>
          <AppText variant="title" style={styles.centerText}>{workout.name}</AppText>
          <AppText color={colors.muted}>{new Date(workout.started_at).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</AppText>
        </View>

        <GymPicker sessionId={id} gymId={workout.gym_id} />

        <View style={styles.statGrid}>
          <StatCard label="Duration" value={`${durationMinutes}`} unit="min" />
          <StatCard label="Working sets" value={`${workingSets}`} unit={`${completedSets} total`} />
          <StatCard label="Volume" value={volume.toLocaleString()} unit={imperial ? 'lb' : 'kg'} />
        </View>

        <Card>
          <View style={styles.sectionTitle}>
            <AppText variant="heading">Exercise recap</AppText>
            <AppText variant="caption" color={colors.muted}>{exercises.length} exercises</AppText>
          </View>
          {exercises.map((exercise, index) => {
            const exerciseSets = [...exercise.workout_sets].sort((a, b) => a.set_index - b.set_index);
            const completed = exerciseSets.filter((set) => set.completed_at);
            const best = completed.reduce<typeof completed[number] | null>((current, set) => {
              if (!current) return set;
              return (set.weight_kg ?? 0) > (current.weight_kg ?? 0) ? set : current;
            }, null);
            const bestWeight = best?.weight_kg === null || best?.weight_kg === undefined ? null : imperial ? kgToLb(best.weight_kg) : best.weight_kg;
            return (
              <View key={exercise.id} style={[styles.exerciseRow, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.exerciseNumber, { backgroundColor: colors.raised }]}><AppText variant="caption">{index + 1}</AppText></View>
                <View style={styles.exerciseCopy}>
                  <AppText variant="heading" numberOfLines={2}>{exercise.exercise.name}</AppText>
                  <AppText variant="caption" color={colors.muted}>{completed.length}/{exerciseSets.length} sets completed{best ? ` · Best ${bestWeight === null ? 'bodyweight' : `${bestWeight.toFixed(1).replace(/\.0$/, '')} ${imperial ? 'lb' : 'kg'}`}${best.reps ? ` × ${best.reps}` : ''}` : ''}</AppText>
                </View>
                {exerciseSets.length > 0 && completed.length === exerciseSets.length ? <Ionicons name="checkmark-circle" color={colors.primary} size={23} /> : null}
              </View>
            );
          })}
          {!exercises.length ? <AppText color={colors.muted}>No exercises were recorded.</AppText> : null}
        </Card>

        {loadGuidance.length ? (
          <Card>
            <View style={styles.sectionTitle}>
              <AppText variant="heading">Next-session loads</AppText>
              <AppText variant="caption" color={colors.muted}>Based on completed working sets</AppText>
            </View>
            {loadGuidance.map(({ exercise, recommendation }, index) => (
              <View key={exercise.id} style={[styles.guidanceRow, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Ionicons name={guidanceIcon(recommendation.action)} color={recommendation.action === 'reduce_load' ? colors.danger : colors.primary} size={22} />
                <View style={styles.exerciseCopy}>
                  <AppText variant="caption" color={recommendation.action === 'reduce_load' ? colors.danger : colors.primary}>{guidanceLabel(recommendation.action)} · {exercise.exercise.name}</AppText>
                  <AppText variant="caption" color={colors.muted}>{recommendation.reason}</AppText>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        <Card>
          <View style={styles.sectionTitle}>
            <AppText variant="heading">Personal records</AppText>
            {records.length ? <View style={[styles.recordBadge, { backgroundColor: colors.raised }]}><AppText variant="caption" color={colors.primary}>{records.length} new</AppText></View> : null}
          </View>
          {records.length ? records.map((exercise) => (
            <View key={exercise.id} style={styles.recordRow}>
              <Ionicons name="trophy-outline" color={colors.primary} size={21} />
              <AppText style={styles.exerciseCopy}>New load best · {exercise.exercise.name}</AppText>
            </View>
          )) : <AppText color={colors.muted}>No new load records today.</AppText>}
        </Card>

        <Button onPress={() => router.replace('/(tabs)/today')}>Done</Button>
        <Button variant="ghost" onPress={() => router.replace('/(tabs)/workouts')}>View training history</Button>
      </Screen>
    </>
  );
}

type GuidanceAction = ReturnType<typeof recommendProgressiveOverload>['action'];

function guidanceLabel(action: GuidanceAction) {
  if (action === 'increase_load') return 'Increase';
  if (action === 'reduce_load') return 'Reduce';
  if (action === 'insufficient_data') return 'Keep logging';
  return 'Hold';
}

function guidanceIcon(action: GuidanceAction): keyof typeof Ionicons.glyphMap {
  if (action === 'increase_load') return 'arrow-up-circle-outline';
  if (action === 'reduce_load') return 'arrow-down-circle-outline';
  if (action === 'insufficient_data') return 'help-circle-outline';
  return 'remove-circle-outline';
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  const { colors } = useAppTheme();
  return (
    <Card style={styles.statCard}>
      <AppText variant="caption" color={colors.muted}>{label}</AppText>
      <AppText variant="number" style={styles.statValue}>{value}</AppText>
      <AppText variant="caption" color={colors.muted}>{unit}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.md },
  topBar: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navigationSpacer: { width: 40, height: 40 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  completeIcon: { width: 58, height: 58, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  centerText: { textAlign: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flexGrow: 1, flexBasis: 138, minWidth: 0, gap: 2, padding: spacing.md },
  statValue: { fontSize: 31, lineHeight: 35 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  exerciseRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  exerciseNumber: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  exerciseCopy: { flex: 1, minWidth: 0 },
  recordBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  recordRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  guidanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.md },
});
