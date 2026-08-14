import { describe, expect, it } from 'vitest';

import { shouldControlNativeSplash } from '@/theme/native-splash';

describe('native splash control', () => {
  it('does not manually control the splash screen inside Expo Go', () => {
    expect(shouldControlNativeSplash('storeClient')).toBe(false);
  });

  it('keeps manual splash control for installable app builds', () => {
    expect(shouldControlNativeSplash('standalone')).toBe(true);
    expect(shouldControlNativeSplash('bare')).toBe(true);
  });
});
