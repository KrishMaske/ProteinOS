import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppText, EmptyState, ErrorState, Field, LoadingState, PressableCard, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ExerciseMedia } from '@/features/exercises/components/exercise-media';
import { useExercises } from '@/features/exercises/hooks/use-exercises';
import { useGyms, useSetGymSubstitution } from '@/features/gyms/hooks/use-gyms';
import { useReplaceWorkoutExercise, useWorkout } from '@/features/workouts/hooks/use-workout';
import { useAuth } from '@/providers/auth-provider';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function ReplaceExerciseScreen() {
  const { workoutId = '', sessionExerciseId = '' } = useLocalSearchParams<{ workoutId: string; sessionExerciseId: string }>();
  const { colors } = useAppTheme();
  const [search, setSearch] = useState('');
  const [replacingKey, setReplacingKey] = useState<string | null>(null);
  const query = useExercises({ search });
  const replace = useReplaceWorkoutExercise(workoutId);
  const workout = useWorkout(workoutId);
  const gyms = useGyms();
  const saveSubstitution = useSetGymSubstitution();
  const { user } = useAuth();
  // Remembering the swap is only meaningful once the session knows where it is.
  const gymId = workout.data?.gym_id ?? null;
  const gym = gyms.data?.find((item) => item.id === gymId) ?? null;
  const [remember, setRemember] = useState(false);
  const current = workout.data?.workout_session_exercises.find((item) => item.id === sessionExerciseId) ?? null;

  async function choose(exerciseKey: string) {
    if (!exerciseKey || replace.isPending) return;
    Keyboard.dismiss();
    setReplacingKey(exerciseKey);
    try {
      await replace.mutateAsync({ id: sessionExerciseId, exerciseKey });
      // Saved after the swap succeeds, so a failed swap leaves no standing rule behind.
      if (remember && user && gymId && current) {
        await saveSubstitution.mutateAsync({
          userId: user.id,
          gymId,
          from: { exercise_id: current.exercise_id, custom_exercise_id: current.custom_exercise_id },
          toExerciseKey: exerciseKey,
        }).catch(() => undefined);
      }
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
      }} />
      <Screen contentContainerStyle={styles.screen}>
        {gym ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: remember }}
            accessibilityLabel={`Always swap this exercise at ${gym.name}`}
            onPress={() => setRemember((value) => !value)}
            style={({ pressed }) => [styles.rememberRow, { backgroundColor: colors.raised, opacity: pressed ? 0.7 : 1 }]}>
            <Ionicons
              name={remember ? 'checkbox' : 'square-outline'}
              size={22}
              color={remember ? colors.primary : colors.muted}
            />
            <View style={styles.rememberCopy}>
              <AppText variant="caption">Always swap this at {gym.name}</AppText>
              <AppText variant="caption" color={colors.muted}>
                Future workouts there start with the replacement already in place
              </AppText>
            </View>
          </Pressable>
        ) : null}
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
  rememberRow: { minWidth: 0, minHeight: 56, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rememberCopy: { flex: 1, minWidth: 0, gap: 2 },
  screen: { paddingTop: spacing.md },
  intro: { gap: spacing.xs },
  results: { gap: spacing.sm, width: '100%' },
  resultCard: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, overflow: 'hidden' },
  resultCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
});
