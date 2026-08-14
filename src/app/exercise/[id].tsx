import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, ErrorState, LoadingState, Screen, SectionHeader } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ExerciseMedia } from '@/features/exercises/components/exercise-media';
import { useExercise, useExerciseHistory } from '@/features/exercises/hooks/use-exercises';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const query = useExercise(id);
  const history = useExerciseHistory(id);
  if (query.isLoading) return <Screen><LoadingState label="Loading exercise…" /></Screen>;
  if (query.isError || !query.data) return <Screen><ErrorState message={query.error?.message ?? 'Exercise not found'} /></Screen>;
  const exercise = query.data;
  const steps = exercise.instruction_steps ?? [];

  return (
    <Screen>
      <ExerciseMedia imageSource={exercise.image_source} gifSource={exercise.gif_source} />
      <View style={styles.heading}>
        <AppText variant="eyebrow" color={colors.primary}>{exercise.source_kind === 'custom' ? 'Your exercise' : exercise.body_part ?? exercise.category}</AppText>
        <AppText variant="title">{exercise.name}</AppText>
        {exercise.description ? <AppText color={colors.muted}>{exercise.description}</AppText> : null}
      </View>

      <View style={[styles.meta, { backgroundColor: colors.surface }]}>
        <Meta label="Target" value={exercise.target} />
        <Meta label="Equipment" value={exercise.equipment} />
        <Meta label="Secondary" value={(exercise.secondary_muscles ?? []).join(', ')} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="How to perform" />
        <View style={[styles.group, { backgroundColor: colors.surface }]}>
          {steps.length ? steps.map((step, index) => <View key={`${index}-${step}`}>
            {index ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
            <View style={styles.step}><View style={[styles.stepNumber, { backgroundColor: colors.softAccent }]}><AppText variant="caption" color={colors.primary}>{index + 1}</AppText></View><AppText style={styles.stepCopy}>{step}</AppText></View>
          </View>) : <AppText style={styles.fallback}>{exercise.instructions ?? 'Instructions are not available for this exercise.'}</AppText>}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recent performance" />
        <View style={[styles.group, { backgroundColor: colors.surface }]}>
          {history.data?.length ? history.data.map((entry, index) => <View key={`${entry.workout_session_id}-${index}`}>
            {index ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
            <View style={styles.performanceRow}><AppText variant="heading">{entry.weight_kg ?? '—'} kg × {entry.reps ?? '—'}</AppText><AppText variant="caption" color={colors.muted}>{entry.started_at ? new Date(entry.started_at).toLocaleDateString() : 'Unknown date'}</AppText></View>
          </View>) : <AppText style={styles.fallback} color={colors.muted}>No completed sets yet.</AppText>}
        </View>
      </View>

      <AppText variant="caption" color={colors.muted}>{exercise.source_kind === 'catalog' ? `Media attribution: ${String((exercise.attribution as Record<string, unknown>).mediaCopyright ?? 'source record')}` : 'Private to your account · imported from your workout file'}</AppText>
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  const { colors } = useAppTheme();
  return <View style={styles.metaItem}><AppText variant="caption" color={colors.muted}>{label}</AppText><AppText>{value || '—'}</AppText></View>;
}

const styles = StyleSheet.create({
  heading: { minWidth: 0, gap: spacing.sm },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, padding: spacing.lg, borderRadius: radius.lg },
  metaItem: { minWidth: 120, flex: 1, gap: spacing.xs },
  section: { minWidth: 0, gap: spacing.md },
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  step: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  stepNumber: { width: 30, height: 30, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepCopy: { flex: 1, minWidth: 0 },
  performanceRow: { minWidth: 0, minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  fallback: { padding: spacing.lg },
});
