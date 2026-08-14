import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui";
import { radius, spacing } from "@/constants/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";

export function ExerciseMedia({
  imageSource,
  gifSource,
  compact = false,
  size,
}: {
  imageSource: string | null;
  gifSource: string | null;
  compact?: boolean;
  /** Overrides the default thumbnail edge length. Ignored unless `compact`. */
  size?: number;
}) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  const source = compact
    ? (imageSource ?? gifSource)
    : (gifSource ?? imageSource);
  const thumb = compact
    ? [styles.compact, size ? { width: size, height: size } : null]
    : null;
  if (!source || failed)
    return (
      <View
        style={[styles.placeholder, thumb, { backgroundColor: colors.raised }]}
      >
        {compact ? (
          <Ionicons
            name="barbell-outline"
            size={size ? Math.round(size * 0.4) : 30}
            color={colors.muted}
          />
        ) : (
          <AppText variant="caption" color={colors.muted}>
            Media unavailable
          </AppText>
        )}
      </View>
    );
  return (
    <Image
      source={{ uri: source }}
      contentFit="cover"
      transition={180}
      onError={() => setFailed(true)}
      accessibilityLabel="Exercise demonstration"
      style={[styles.image, thumb]}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", aspectRatio: 1, borderRadius: radius.lg },
  placeholder: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  compact: {
    width: 92,
    height: 92,
    aspectRatio: undefined,
    borderRadius: radius.md,
  },
});
