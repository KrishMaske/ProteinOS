import { describe, expect, it } from 'vitest';

import { localDateKey } from '@/lib/date';

describe('localDateKey', () => {
  it('uses the device calendar date instead of the UTC date', () => {
    const instant = new Date('2026-08-13T02:30:00.000Z');
    instant.getFullYear = () => 2026;
    instant.getMonth = () => 7;
    instant.getDate = () => 12;

    expect(localDateKey(instant)).toBe('2026-08-12');
  });
});
