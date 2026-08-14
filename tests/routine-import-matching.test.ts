import { describe, expect, it } from 'vitest';

import {
  exactNormalizedCatalogMatch,
  matchExercise,
  normalizeExerciseName,
  rankExerciseCandidates,
} from '../supabase/functions/import-workout-file/matching';

const catalog = [
  { id: 'barbell-bench', name: 'barbell bench press' },
  { id: 'band-bench', name: 'band bench press' },
  { id: 'dumbbell-bench', name: 'dumbbell bench press' },
  { id: 'dumbbell-lateral', name: 'dumbbell lateral raise' },
  { id: 'cable-row', name: 'cable seated row' },
];

describe('routine import exercise matching', () => {
  it('normalizes common gym abbreviations and plural forms', () => {
    expect(normalizeExerciseName('DB Flyes')).toBe('dumbbell fly');
    expect(normalizeExerciseName('Dumbbell Lateral Raises')).toBe('dumbbell lateral raise');
  });

  it('matches a specific normalized exercise deterministically', () => {
    const match = matchExercise('Dumbbell lateral raises', catalog);
    expect(match).toMatchObject({ exercise: { id: 'dumbbell-lateral' }, confidence: 1 });
  });

  it('does not silently guess when a generic name has several equally close matches', () => {
    expect(matchExercise('bench press', catalog)).toBeNull();
  });

  it('does not force an unrelated low-confidence catalog match', () => {
    expect(matchExercise('sled backward drag', catalog)).toBeNull();
  });

  it('uses source details to rank a safe, deterministic catalog shortlist', () => {
    const ranked = rankExerciseCandidates(
      'Bench press',
      'Performed with dumbbells on a flat bench for the chest',
      catalog,
      3,
    );
    expect(ranked).toHaveLength(3);
    expect(ranked[0].exercise.id).toBe('dumbbell-bench');
    expect(ranked.map(({ exercise }) => exercise.id)).not.toContain('cable-row');
  });

  it('keeps a typo-tolerant movement match in the bounded shortlist for a full catalog', () => {
    const fullCatalog = Array.from({ length: 1_323 }, (_, index) => ({
      id: `distractor-${index}`,
      name: `machine movement variation ${index + 1}`,
      equipment: 'machine',
      target: index % 2 ? 'quadriceps' : 'back',
    }));
    fullCatalog.push({
      id: 'flat-dumbbell-bench',
      name: 'dumbbell flat bench press',
      equipment: 'dumbbell',
      target: 'pectorals',
    });

    const first = rankExerciseCandidates(
      'DB flat bench pres',
      'Flat dumbbell chest press targeting the pectorals',
      fullCatalog,
      8,
    );
    const second = rankExerciseCandidates(
      'DB flat bench pres',
      'Flat dumbbell chest press targeting the pectorals',
      fullCatalog,
      8,
    );

    expect(first[0].exercise.id).toBe('flat-dumbbell-bench');
    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
  });

  it('treats duplicate normalized titles as ambiguous exact matches', () => {
    expect(exactNormalizedCatalogMatch('DB flyes', [
      { id: 'one', name: 'dumbbell fly' },
      { id: 'two', name: 'DB flies' },
    ])).toBeNull();
    expect(exactNormalizedCatalogMatch('DB flyes', [
      { id: 'one', name: 'dumbbell fly' },
      { id: 'two', name: 'cable fly' },
    ])?.id).toBe('one');
  });
});
