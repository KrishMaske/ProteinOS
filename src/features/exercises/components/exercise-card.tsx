import { Link } from "expo-router";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

import { AppText } from "@/components/ui";
import { radius, spacing } from "@/constants/tokens";
import type { LibraryExercise } from "@/features/exercises/api/search-exercises";
import { ExerciseMedia } from "@/features/exercises/components/exercise-media";
import { useAppTheme } from "@/hooks/use-app-theme";

export function ExerciseCard({
  exercise,
  mediaSize,
  style,
}: {
  exercise: LibraryExercise;
  mediaSize: number;
  style?: ViewStyle;
}) {
  const { colors } = useAppTheme();
  const exerciseKey = exercise.exercise_key ?? "";
  return (
    <Link
      href={{ pathname: "/exercise/[id]", params: { id: exerciseKey } }}
      asChild
    >
      <Pressable
        accessibilityLabel={`Open ${exercise.name}`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.surface, opacity: pressed ? 0.68 : 1 },
          style,
        ]}
      >
        <ExerciseMedia
          compact
          size={mediaSize}
          imageSource={exercise.image_source}
          gifSource={exercise.gif_source}
        />
        {/* Pinned to the image width so a long exercise name truncates instead of
            stretching the tile and breaking the fixed column count. */}
        <View style={[styles.copy, { width: mediaSize }]}>
          <AppText
            variant="heading"
            numberOfLines={1}
            ellipsizeMode="tail"
            style={styles.name}
          >
            {exercise.name}
          </AppText>
          <AppText
            variant="caption"
            color={colors.muted}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {exercise.target ?? exercise.body_part ?? "General"}
          </AppText>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 0,
    overflow: "hidden",
    padding: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  copy: { minWidth: 0, gap: 1 },
  name: { fontSize: 14, lineHeight: 18 },
});
