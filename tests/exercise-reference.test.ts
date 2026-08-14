import { describe, expect, it } from 'vitest';

import { exerciseKeyFromReference, exerciseReferenceFromKey, exerciseSummary } from '../src/features/exercises/exercise-reference';

describe('exercise references', () => {
  it('round-trips catalog and custom keys without mixing identifiers', () => {
    expect(exerciseReferenceFromKey('catalog:barbell-bench-press')).toEqual({
      exercise_id: 'barbell-bench-press',
      custom_exercise_id: null,
    });
    expect(exerciseReferenceFromKey('custom:9f18f335-f4bd-4b11-988d-b2cebb504103')).toEqual({
      exercise_id: null,
      custom_exercise_id: '9f18f335-f4bd-4b11-988d-b2cebb504103',
    });
  });

  it('rejects unscoped and unknown exercise keys', () => {
    expect(() => exerciseReferenceFromKey('barbell-bench-press')).toThrow('valid exercise');
    expect(() => exerciseReferenceFromKey('shared:barbell-bench-press')).toThrow('valid exercise');
  });

  it('normalizes either nested relation into one exercise model', () => {
    const custom = { id: 'custom-id', name: 'Cable lat prayer', target: 'lats', equipment: 'cable' };
    expect(exerciseSummary(
      { exercise_id: null, custom_exercise_id: custom.id },
      null,
      custom,
    )).toEqual({ exercise: custom, exerciseKey: `custom:${custom.id}` });
    expect(exerciseKeyFromReference({ exercise_id: 'catalog-id', custom_exercise_id: null })).toBe('catalog:catalog-id');
  });
});
