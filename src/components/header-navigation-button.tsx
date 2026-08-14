import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

import { radius } from "@/constants/tokens";
import { useAppTheme } from "@/hooks/use-app-theme";

/**
 * Back/close/top-bar button for the screens that draw their own bar instead of using the
 * native stack header. Stack screens use the platform's default header button; this mirrors
 * it with the same plain arrow and close glyphs so the two read alike.
 */
export const HEADER_BUTTON_SIZE = 40;
export const HEADER_ICON_SIZE = 24;

type HeaderNavigationButtonProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  fallbackHref?: Href;
  icon?: keyof typeof Ionicons.glyphMap;
  mode?: "back" | "close";
  onPress?: () => void;
};

export function HeaderNavigationButton({
  accessibilityLabel,
  disabled,
  fallbackHref = "/(tabs)/today",
  icon,
  mode = "back",
  onPress,
}: HeaderNavigationButtonProps) {
  const { colors } = useAppTheme();
  const close = mode === "close";

  function leave() {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? (close ? "Close" : "Go back")}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={10}
      onPress={leave}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? 0.4 : pressed ? 0.5 : 1 },
      ]}
    >
      <Ionicons
        name={icon ?? (close ? "close" : "arrow-back")}
        size={HEADER_ICON_SIZE}
        color={colors.text}
      />
    </Pressable>
  );
}

export const headerButtonStyle = {
  width: HEADER_BUTTON_SIZE,
  height: HEADER_BUTTON_SIZE,
  flexShrink: 0,
  borderRadius: radius.pill,
  alignItems: "center",
  justifyContent: "center",
} as const;

const styles = StyleSheet.create({ button: headerButtonStyle });
