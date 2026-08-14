import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, ErrorState, Field, LoadingState, PressableCard, Screen } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import { ExerciseMedia } from '@/features/exercises/components/exercise-media';
import { useExercises } from '@/features/exercises/hooks/use-exercises';
import { useReplaceWorkoutExercise } from '@/features/workouts/hooks/use-workout';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function ReplaceExerciseScreen() {
  const { workoutId = '', sessionExerciseId = '' } = useLocalSearchParams<{ workoutId: string; sessionExerciseId: string }>();
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const [replacingKey, setReplacingKey] = useState<string | null>(null);
  const query = useExercises({ search });
  const replace = useReplaceWorkoutExercise(workoutId);

  async function choose(exerciseKey: string) {
    if (!exerciseKey || replace.isPending) return;
    Keyboard.dismiss();
    setReplacingKey(exerciseKey);
    try {
      await replace.mutateAsync({ id: sessionExerciseId, exerciseKey });
      router.back();
    } catch {
      setReplacingKey(null);
    }
  }

  return (
    <>
      <Stack.Screen options={{
        title: 'Swap exercise',
        gestureEnabled: !replace.isPending,
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable accessibilityLabel="Cancel exercise replacement" disabled={replace.isPending} onPress={() => router.back()} style={styles.cancelButton}>
            <AppText color={colors.primary}>Cancel</AppText>
          </Pressable>
        ),
      }} />
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.intro}>
          <AppText variant="heading">Choose a replacement</AppText>
          <AppText color={colors.muted}>Your logged sets stay in this workout. Only the exercise changes.</AppText>
        </View>
        <Field
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          label="Search exercises"
          onChangeText={setSearch}
          placeholder="Name, movement, or variation"
          returnKeyType="search"
          value={search}
        />

        {query.isLoading ? <LoadingState label="Finding exercises…" /> : null}
        {query.isError ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : null}
        {!query.isLoading && !query.isError && query.data?.length ? (
          <View style={styles.results}>
            <AppText variant="caption" color={colors.muted}>{search.trim() ? `${query.data.length} results` : 'Suggested exercises'}</AppText>
            {query.data.map((exercise, index) => {
              const key = exercise.exercise_key ?? '';
              const replacing = key === replacingKey;
              return (
                <PressableCard
                  accessibilityLabel={`Replace with ${exercise.name}`}
                  disabled={!key || replace.isPending}
                  key={key || `${exercise.name}-${index}`}
                  onPress={() => void choose(key)}
                  style={styles.resultCard}>
                  <ExerciseMedia compact imageSource={exercise.image_source} gifSource={exercise.gif_source} />
                  <View style={styles.resultCopy}>
                    <AppText variant="heading" numberOfLines={2}>{exercise.name}</AppText>
                    <AppText variant="caption" color={colors.primary} numberOfLines={2}>{exercise.target ?? 'General'} · {exercise.equipment ?? 'Equipment not listed'}</AppText>
                    {exercise.source_kind === 'custom' ? <AppText variant="caption" color={colors.muted}>Your custom exercise</AppText> : null}
                  </View>
                  {replacing ? <AppText variant="caption" color={colors.primary}>Saving…</AppText> : <Ionicons name="chevron-forward" color={colors.muted} size={21} />}
                </PressableCard>
              );
            })}
          </View>
        ) : null}
        {!query.isLoading && !query.isError && !query.data?.length ? <EmptyState title="No exercises found" description="Check the spelling or try a broader movement name." /> : null}
        {replace.error ? <AppText color={colors.danger}>{replace.error.message}</AppText> : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.md },
  cancelButton: { minHeight: 44, minWidth: 60, alignItems: 'flex-start', justifyContent: 'center', paddingRight: spacing.sm },
  intro: { gap: spacing.xs },
  results: { gap: spacing.sm, width: '100%' },
  resultCard: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, overflow: 'hidden' },
  resultCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
});
