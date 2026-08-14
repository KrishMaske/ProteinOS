import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import type { RoutineExerciseWithDetails } from '@/features/routines/api/routines';
import { useRemoveRoutineExercise, useRoutine, useUpdateRoutineExercise } from '@/features/routines/hooks/use-routines';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function EditRoutineExerciseScreen() {
  const { id, routineId } = useLocalSearchParams<{ id: string; routineId: string }>();
  const query = useRoutine(routineId);
  if (query.isLoading) return <Screen><LoadingState /></Screen>;
  if (query.isError) return <Screen><ErrorState message={query.error.message} /></Screen>;
  const exercise = query.data?.routine_days.flatMap((day) => day.routine_exercises).find((item) => item.id === id);
  if (!exercise) return <Screen><ErrorState message="Exercise prescription not found" /></Screen>;
  return <PrescriptionForm exercise={exercise} routineId={routineId} />;
}

function PrescriptionForm({ exercise, routineId }: { exercise: RoutineExerciseWithDetails; routineId: string }) {
  const { colors } = useAppTheme();
  const update = useUpdateRoutineExercise(routineId);
  const remove = useRemoveRoutineExercise(routineId);
  const [sets, setSets] = useState(String(exercise.target_sets));
  const [repMin, setRepMin] = useState(exercise.rep_min?.toString() ?? '');
  const [repMax, setRepMax] = useState(exercise.rep_max?.toString() ?? '');
  const [rest, setRest] = useState(String(exercise.rest_seconds));
  const [rir, setRir] = useState(exercise.target_rir?.toString() ?? '');
  const [rpe, setRpe] = useState(exercise.target_rpe?.toString() ?? '');
  const [notes, setNotes] = useState(exercise.notes ?? '');

  const nullable = (value: string) => value.trim() ? Number(value) : null;
  const parsedSets = Number(sets);
  const parsedMin = nullable(repMin);
  const parsedMax = nullable(repMax);
  const parsedRest = Number(rest);
  const parsedRir = nullable(rir);
  const parsedRpe = nullable(rpe);
  const validationError = !Number.isInteger(parsedSets) || parsedSets < 1 || parsedSets > 20
    ? 'Sets must be a whole number from 1 to 20.'
    : parsedMin !== null && (!Number.isInteger(parsedMin) || parsedMin < 1)
      ? 'Minimum reps must be a positive whole number.'
      : parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax < 1)
        ? 'Maximum reps must be a positive whole number.'
        : parsedMin !== null && parsedMax !== null && parsedMin > parsedMax
          ? 'Minimum reps cannot exceed maximum reps.'
          : !Number.isFinite(parsedRest) || parsedRest < 0 || parsedRest > 3600
            ? 'Rest must be between 0 and 3,600 seconds.'
            : parsedRir !== null && (parsedRir < 0 || parsedRir > 10)
              ? 'RIR must be between 0 and 10.'
              : parsedRpe !== null && (parsedRpe < 1 || parsedRpe > 10)
                ? 'RPE must be between 1 and 10.'
                : null;

  async function save() {
    if (validationError) return;
    try {
      await update.mutateAsync({
        id: exercise.id,
        values: {
          target_sets: parsedSets,
          rep_min: parsedMin,
          rep_max: parsedMax,
          rest_seconds: parsedRest,
          target_rir: parsedRir,
          target_rpe: parsedRpe,
          notes: notes.trim() || null,
        },
      });
      router.back();
    } catch {
      // The mutation error remains visible and the edited prescription stays intact.
    }
  }

  async function removeItem() {
    try {
      await remove.mutateAsync(exercise.id);
      router.back();
    } catch {
      // The mutation error remains visible so removal can be retried safely.
    }
  }

  function confirmRemove() {
    Alert.alert('Remove exercise?', `${exercise.exercise.name} will be removed from this routine.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeItem() },
    ]);
  }

  return (
    <Screen footer={<Button onPress={() => void save()} disabled={Boolean(validationError) || update.isPending}>{update.isPending ? 'Saving…' : 'Save prescription'}</Button>}>
      <View style={styles.header}>
        <AppText variant="eyebrow" color={colors.primary}>Exercise setup</AppText>
        <AppText variant="title">{exercise.exercise.name}</AppText>
        <AppText color={colors.muted}>Set the target for each working set. You can log what you actually perform during the workout.</AppText>
      </View>

      <Card>
        <AppText variant="heading">Sets and reps</AppText>
        <View style={styles.fieldRow}>
          <Field containerStyle={styles.shortField} label="Sets" keyboardType="number-pad" value={sets} onChangeText={setSets} selectTextOnFocus />
          <Field containerStyle={styles.shortField} label="Min reps" keyboardType="number-pad" value={repMin} onChangeText={setRepMin} placeholder="Optional" selectTextOnFocus />
          <Field containerStyle={styles.shortField} label="Max reps" keyboardType="number-pad" value={repMax} onChangeText={setRepMax} placeholder="Optional" selectTextOnFocus />
        </View>
      </Card>

      <Card>
        <AppText variant="heading">Effort and recovery</AppText>
        <View style={styles.fieldRow}>
          <Field containerStyle={styles.mediumField} label="Rest (sec)" keyboardType="number-pad" value={rest} onChangeText={setRest} selectTextOnFocus />
          <Field containerStyle={styles.shortField} label="Target RIR" keyboardType="decimal-pad" value={rir} onChangeText={setRir} placeholder="Optional" selectTextOnFocus />
          <Field containerStyle={styles.shortField} label="Target RPE" keyboardType="decimal-pad" value={rpe} onChangeText={setRpe} placeholder="Optional" selectTextOnFocus />
        </View>
        <AppText variant="caption" color={colors.muted}>Use either RIR or RPE if you track effort; leaving both blank is fine.</AppText>
      </Card>

      <Card>
        <AppText variant="heading">Notes</AppText>
        <Field label="Cues or variations" value={notes} onChangeText={setNotes} multiline placeholder="Grip, tempo, setup, or progression notes…" />
      </Card>

      {validationError ? <AppText color={colors.danger}>{validationError}</AppText> : null}
      {update.error || remove.error ? <AppText color={colors.danger}>{update.error?.message ?? remove.error?.message}</AppText> : null}
      <Button variant="danger" onPress={confirmRemove} disabled={remove.isPending}>{remove.isPending ? 'Removing…' : 'Remove from routine'}</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minWidth: 0, gap: spacing.sm },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  shortField: { flexGrow: 1, flexBasis: 92 },
  mediumField: { flexGrow: 1, flexBasis: 116 },
});
