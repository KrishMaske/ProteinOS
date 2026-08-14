import { describe, expect, it } from 'vitest';

import {
  isSupportedFoodImage,
  MAX_FOOD_PHOTO_BYTES,
} from '../supabase/functions/analyze-food/validation.ts';

describe('food photo validation', () => {
  it('accepts supported image signatures', () => {
    expect(isSupportedFoodImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), 'image/jpeg')).toBe(true);
    expect(isSupportedFoodImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'image/png')).toBe(true);
    expect(isSupportedFoodImage(new TextEncoder().encode('RIFF0000WEBP'), 'image/webp')).toBe(true);
  });

  it('rejects empty, mismatched, and oversized uploads', () => {
    expect(isSupportedFoodImage(new Uint8Array(), 'image/jpeg')).toBe(false);
    expect(isSupportedFoodImage(new TextEncoder().encode('not a jpeg!!'), 'image/jpeg')).toBe(false);
    expect(isSupportedFoodImage(new Uint8Array(MAX_FOOD_PHOTO_BYTES + 1), 'image/png')).toBe(false);
  });
});
