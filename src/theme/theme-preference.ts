export const themePreferences = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof themePreferences)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return isThemePreference(value) ? value : 'system';
}

/**
 * `systemScheme` mirrors React Native's ColorSchemeName, which reports 'unspecified'
 * rather than null when the device has no explicit preference.
 */
export function resolveThemePreference(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | 'unspecified' | null | undefined,
): ResolvedTheme {
  if (preference !== 'system') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
