import { describe, expect, it } from 'vitest';

import { parseThemePreference, resolveThemePreference } from '@/theme/theme-preference';

describe('theme preference', () => {
  it('keeps valid saved preferences', () => {
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  it('falls back safely when storage contains an unknown value', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('midnight')).toBe('system');
  });

  it('only follows the device when system is selected', () => {
    expect(resolveThemePreference('system', 'dark')).toBe('dark');
    expect(resolveThemePreference('system', 'light')).toBe('light');
    expect(resolveThemePreference('dark', 'light')).toBe('dark');
    expect(resolveThemePreference('light', 'dark')).toBe('light');
  });
});
