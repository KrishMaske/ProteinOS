import { describe, expect, it } from 'vitest';

import { parseSetEntry, stepEntry } from './set-entry';

const fields = { weight: '100', reps: '8', duration: '', rpe: '', rir: '' };

describe('workout set entry', () => {
  it('normalizes imperial weight for persistence', () => {
    const result = parseSetEntry(fields, true, true);
    expect(result.error).toBeNull();
    expect(result.values?.weight_kg).toBeCloseTo(45.36, 1);
    expect(result.values?.reps).toBe(8);
  });

  it('allows bodyweight entries but requires reps or duration when completing', () => {
    expect(parseSetEntry({ ...fields, weight: '' }, false, true).error).toBeNull();
    expect(parseSetEntry({ ...fields, weight: '', reps: '' }, false, true).error).toContain('reps');
    expect(parseSetEntry({ ...fields, weight: '', reps: '', duration: '30' }, false, true).error).toBeNull();
  });

  it('rejects impossible effort values', () => {
    expect(parseSetEntry({ ...fields, rpe: '11' }, false).error).toContain('RPE');
    expect(parseSetEntry({ ...fields, rir: '-1' }, false).error).toContain('RIR');
  });

  it('steps empty and decimal values without going below zero', () => {
    expect(stepEntry('', 5)).toBe('5');
    expect(stepEntry('2.5', 2.5)).toBe('5');
    expect(stepEntry('1', -5)).toBe('0');
  });
});
