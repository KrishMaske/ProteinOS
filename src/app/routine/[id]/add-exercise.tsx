import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
    AppText,
    EmptyState,
    ErrorState,
    Field,
    LoadingState,
    Screen,
} from "@/components/ui";
import { radius, spacing } from "@/constants/tokens";
import { ExerciseMedia } from "@/features/exercises/components/exercise-media";
import { useExercises } from "@/features/exercises/hooks/use-exercises";
import { addExerciseToDay } from "@/features/routines/api/routines";
import { routineKeys } from "@/features/routines/hooks/use-routines";
import { useAppTheme } from "@/hooks/use-app-theme";

export default function AddExerciseScreen() {
  const { id, dayId, index } = useLocalSearchParams<{
    id: string;
    dayId: string;
    index: string;
  }>();
  const { colors } = useAppTheme();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const query = useExercises({ search });

  async function add(exerciseKey: string) {
    if (addingKey) return;
    setAddingKey(exerciseKey);
    setAddError(null);
    try {
      await addExerciseToDay(dayId, exerciseKey, Number(index));
      await client.invalidateQueries({ queryKey: routineKeys.detail(id) });
      router.back();
    } catch (error) {
      setAddingKey(null);
      setAddError(
        error instanceof Error ? error.message : "Could not add that exercise.",
      );
    }
  }

  return (
    <Screen>
      <View style={styles.searchHeader}>
        <AppText variant="heading">Choose an exercise</AppText>
        <AppText color={colors.muted}>
          Search the shared library and your private imported exercises.
        </AppText>
        <Field
          label="Search exercises"
          value={search}
          onChangeText={setSearch}
          placeholder="Bench press, cable row…"
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>
      {addError ? <AppText color={colors.danger}>{addError}</AppText> : null}
      {query.isLoading ? (
        <LoadingState label="Searching exercises…" />
      ) : query.isError ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => query.refetch()}
        />
      ) : query.data?.length ? (
        <View style={styles.list}>
          {query.data.map((exercise) => {
            const key = exercise.exercise_key ?? "";
            const pending = addingKey === key;
            return (
              <Pressable
                accessibilityLabel={`Add ${exercise.name}`}
                accessibilityRole="button"
                disabled={Boolean(addingKey) || !key}
                key={key}
                onPress={() => void add(key)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    opacity: addingKey && !pending ? 0.45 : pressed ? 0.72 : 1,
                  },
                ]}
              >
                <ExerciseMedia
                  compact
                  imageSource={exercise.image_source}
                  gifSource={exercise.gif_source}
                />
                <View style={styles.copy}>
                  <AppText variant="heading" numberOfLines={2}>
                    {exercise.name}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {exercise.target ?? "General"} ·{" "}
                    {exercise.equipment ?? "Equipment not listed"}
                  </AppText>
                </View>
                <View
                  style={[styles.addIcon, { backgroundColor: colors.raised }]}
                >
                  <Ionicons
                    name={pending ? "ellipsis-horizontal" : "add"}
                    size={22}
                    color={colors.primary}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <EmptyState
          title="No exercises found"
          description="Try a broader name or remove a filter."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchHeader: { gap: spacing.md },
  list: { gap: spacing.sm },
  row: {
    minWidth: 0,
    minHeight: 112,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs, justifyContent: "center" },
  addIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
