import { describe, expect, it } from 'vitest';
import { sevenDayMovingAverage } from './moving-average';

describe('sevenDayMovingAverage', () => {
  it('excludes observations older than seven calendar days', () => {
    expect(sevenDayMovingAverage([{ date: '2026-01-01', value: 80 }, { date: '2026-01-08', value: 82 }])[1].value).toBe(82);
  });
});
