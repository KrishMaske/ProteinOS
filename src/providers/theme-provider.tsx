import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { palette } from '@/constants/tokens';
import {
  parseThemePreference,
  resolveThemePreference,
  type ThemePreference,
} from '@/theme/theme-preference';
import { shouldControlNativeSplash } from '@/theme/native-splash';

const THEME_PREFERENCE_KEY = '@proteinos/theme-preference';
const canControlNativeSplash = shouldControlNativeSplash(Constants.executionEnvironment);

// Keep the native splash visible until the persisted preference is known so a
// manually selected theme never flashes through the device theme at launch.
if (canControlNativeSplash) void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const lightColors = {
  background: palette.paper,
  surface: palette.surfaceLight,
  raised: palette.raisedLight,
  softAccent: palette.brownSoftLight,
  text: palette.ink,
  muted: palette.mutedLight,
  line: palette.lineLight,
  primary: palette.brownDark,
  onPrimary: palette.paper,
  danger: palette.danger,
};

const darkColors = {
  background: palette.ink,
  surface: palette.surfaceDark,
  raised: palette.raisedDark,
  softAccent: palette.brownSoftDark,
  text: palette.paper,
  muted: palette.mutedDark,
  line: palette.lineDark,
  primary: palette.brown,
  onPrimary: palette.ink,
  danger: palette.danger,
};

export type AppColors = typeof lightColors;

type ThemeContextValue = {
  colors: AppColors;
  isDark: boolean;
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (active) {
          setPreferenceState(parseThemePreference(stored));
          setHydrated(true);
        }
      })
      .catch(() => {
        // The system preference remains a safe fallback when storage is unavailable.
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, nextPreference);
    } catch {
      // The selection still applies for the current session if persistence fails.
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // null hands control back to the device on React Native 0.81; 0.86 renames this to
    // 'unspecified', so this line changes when the project moves back to SDK 57.
    Appearance.setColorScheme(preference === 'system' ? null : preference);
  }, [hydrated, preference]);

  const resolvedTheme = resolveThemePreference(preference, systemScheme);
  const isDark = resolvedTheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  useEffect(() => {
    if (!hydrated) return;
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background, hydrated]);

  useEffect(() => {
    if (!hydrated || !canControlNativeSplash) return;
    try {
      SplashScreen.hide();
    } catch {
      // Fast refresh can race the native splash teardown in development builds.
    }
  }, [hydrated]);

  const value = useMemo<ThemeContextValue>(() => ({
    colors,
    isDark,
    preference,
    resolvedTheme,
    setPreference,
  }), [colors, isDark, preference, resolvedTheme, setPreference]);

  if (!hydrated) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used within AppThemeProvider');
  return value;
}
