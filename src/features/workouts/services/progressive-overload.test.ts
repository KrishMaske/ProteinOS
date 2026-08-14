import { describe, expect, it } from 'vitest';

import { recommendProgressiveOverload, type PerformanceSet } from './progressive-overload';

function set(reps: number, options: Partial<PerformanceSet> = {}): PerformanceSet {
  return { reps, rir: 2, rpe: null, weightKg: 80, completed: true, type: 'working', ...options };
}

describe('progressive overload', () => {
  it('suggests a conservative increase when every planned working set tops the range at target effort', () => {
    expect(recommendProgressiveOverload([set(12), set(12), set(13)], 8, 12, 2, null, 3)).toMatchObject({
      action: 'increase_load',
      suggestedChangePercent: 2.5,
    });
  });

  it('does not suggest an increase from a partial current session', () => {
    expect(recommendProgressiveOverload([set(12)], 8, 12, 2, null, 3).action).toBe('insufficient_data');
  });

  it('holds when working sets are still inside the rep range', () => {
    expect(recommendProgressiveOverload([set(12), set(10), set(9)], 8, 12, 2, null, 3).action).toBe('maintain_load');
  });

  it('holds when top reps are reached without complete effort data', () => {
    expect(recommendProgressiveOverload([
      set(12),
      set(12, { rir: null }),
    ], 8, 12, 2, null, 2).action).toBe('maintain_load');
  });

  it('suggests reducing when a set misses the minimum at harder-than-planned effort', () => {
    expect(recommendProgressiveOverload([
      set(8),
      set(6, { rir: 0 }),
      set(5, { rir: 0 }),
    ], 8, 12, 2, null, 3)).toMatchObject({ action: 'reduce_load', suggestedChangePercent: -5 });
  });

  it('holds after one unusually hard missed set', () => {
    expect(recommendProgressiveOverload([
      set(10),
      set(9),
      set(6, { rir: 0 }),
    ], 8, 12, 2, null, 3).action).toBe('maintain_load');
  });

  it('uses a majority of missed sets when no effort target is prescribed', () => {
    expect(recommendProgressiveOverload([set(8), set(6), set(5)], 8, 12, null, null, 3).action).toBe('reduce_load');
  });

  it('excludes warm-up, drop and failure sets from the signal', () => {
    expect(recommendProgressiveOverload([
      set(12),
      set(12),
      set(12),
      set(3, { type: 'warmup' }),
      set(4, { type: 'drop' }),
      set(2, { type: 'failure' }),
    ], 8, 12, 2, null, 3).action).toBe('increase_load');
  });

  it('preserves bodyweight entries without inventing a percentage load change', () => {
    expect(recommendProgressiveOverload([
      set(12, { weightKg: null }),
      set(12, { weightKg: null }),
    ], 8, 12, 2, null, 2)).toMatchObject({ action: 'increase_load', suggestedChangePercent: null });
  });

  it('does not infer from missing completed data or a missing rep target', () => {
    expect(recommendProgressiveOverload([], 8, 12, 2, null, 3).action).toBe('insufficient_data');
    expect(recommendProgressiveOverload([set(12)], null, null, 2, null, 1).action).toBe('insufficient_data');
  });
});
