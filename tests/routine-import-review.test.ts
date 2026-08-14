import { describe, expect, it } from 'vitest';

import { cropRgba, normalizedCropToPixels } from '../supabase/functions/import-workout-file/image-crop';
import { MAX_FILE_BYTES, MAX_STAGED_IMAGE_BYTES } from '../supabase/functions/import-workout-file/limits';
import type { CatalogExercise } from '../supabase/functions/import-workout-file/matching';
import {
  assignStableImportKeys,
  createCandidateSets,
  MAX_UNIQUE_IMPORT_EXERCISES,
  resolveSemanticSelections,
  type WorkoutExtraction,
} from '../supabase/functions/import-workout-file/review';

const catalog: CatalogExercise[] = [
  { id: 'barbell-bench', name: 'barbell bench press', equipment: 'barbell', target: 'pectorals' },
  { id: 'dumbbell-bench', name: 'dumbbell bench press', equipment: 'dumbbell', target: 'pectorals' },
  { id: 'cable-fly', name: 'cable standing fly', equipment: 'cable', target: 'pectorals' },
];

function extraction(): WorkoutExtraction {
  return {
    routineName: 'Alternating split',
    description: null,
    warnings: [],
    days: [{
      dayKey: 'untrusted-key',
      name: 'Chest A',
      notes: null,
      isRestDay: false,
      exercises: [{
        exerciseKey: '../../untrusted',
        sourceTitle: 'DB bench press',
        sourceDetails: 'Flat dumbbell chest press',
        pageNumber: 2,
        imageCrop: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
        customExercise: {
          category: 'strength',
          bodyPart: 'chest',
          equipment: 'dumbbell',
          target: 'pectorals',
          muscleGroup: 'chest',
          secondaryMuscles: ['triceps'],
          instructions: null,
          instructionSteps: [],
        },
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        restSeconds: 90,
        targetRpe: null,
        targetRir: 2,
        notes: null,
      }],
    }],
  };
}

describe('routine import review construction', () => {
  it('keeps the source limit at exactly 10 MiB and staged media at 5 MiB', () => {
    expect(MAX_FILE_BYTES).toBe(10_485_760);
    expect(MAX_STAGED_IMAGE_BYTES).toBe(5_242_880);
  });

  it('replaces model keys with deterministic path-safe position keys', () => {
    const stable = assignStableImportKeys(extraction());
    expect(stable.days[0].dayKey).toBe('slot-01');
    expect(stable.days[0].exercises[0].exerciseKey).toBe('exercise-001');
  });

  it('shares one review key across repeated occurrences of the same movement', () => {
    const repeated = extraction();
    repeated.days.push({
      ...repeated.days[0],
      dayKey: 'other-model-key',
      name: 'Chest B',
      exercises: [{
        ...repeated.days[0].exercises[0],
        exerciseKey: 'another-model-key',
        targetSets: 4,
        repMin: 5,
        repMax: 8,
      }],
    });
    const stable = assignStableImportKeys(repeated);
    expect(stable.days[0].exercises[0].exerciseKey).toBe('exercise-001');
    expect(stable.days[1].exercises[0].exerciseKey).toBe('exercise-001');
    expect(stable.days[1].exercises[0]).toMatchObject({ targetSets: 4, repMin: 5, repMax: 8 });
    expect(createCandidateSets(stable, catalog)).toHaveLength(1);
  });

  it('accepts only a semantic suggestion from that exercise candidate allowlist', () => {
    const stable = assignStableImportKeys(extraction());
    const candidates = createCandidateSets(stable, catalog);
    const reviews = resolveSemanticSelections(candidates, [{
      exerciseKey: 'exercise-001',
      suggestedExerciseId: 'dumbbell-bench',
      confidence: 0.96,
      reason: 'The title and dumbbell details describe the same movement.',
    }]);
    expect(reviews[0].suggestedResolution).toMatchObject({
      type: 'catalog',
      exerciseId: 'dumbbell-bench',
      confidence: 0.96,
    });
    expect(reviews[0].candidates.length).toBeLessThanOrEqual(8);
  });

  it('rejects hallucinated catalog IDs even when the model reports high confidence', () => {
    const candidates = createCandidateSets(assignStableImportKeys(extraction()), catalog);
    expect(() => resolveSemanticSelections(candidates, [{
      exerciseKey: 'exercise-001',
      suggestedExerciseId: 'invented-id',
      confidence: 1,
      reason: 'Invented.',
    }])).toThrow(/outside the allowlist/);
  });

  it('suggests a custom exercise for no-match selections', () => {
    const candidates = createCandidateSets(assignStableImportKeys(extraction()), catalog);
    const reviews = resolveSemanticSelections(candidates, [{
      exerciseKey: 'exercise-001',
      suggestedExerciseId: null,
      confidence: 0.2,
      reason: 'No candidate preserves the source movement details.',
    }]);
    expect(reviews[0].suggestedResolution).toEqual({
      type: 'custom',
      name: 'DB bench press',
      confidence: 0.8,
      reason: 'No candidate preserves the source movement details.',
    });
  });

  it('builds deterministic bounded reviews for 40 movements against 1,324 catalog rows', () => {
    const largeCatalog: CatalogExercise[] = Array.from({ length: 1_324 }, (_, index) => ({
      id: `catalog-${index}`,
      name: `dumbbell movement variation ${index + 1}`,
      equipment: 'dumbbell',
      target: index % 2 ? 'back' : 'chest',
    }));
    const largeExtraction = extraction();
    largeExtraction.days[0].exercises = Array.from({ length: 40 }, (_, index) => ({
      ...largeExtraction.days[0].exercises[0],
      exerciseKey: `untrusted-${index}`,
      sourceTitle: `dumbbell movement variation ${(index * 31) + 1}`,
      sourceDetails: index % 2 ? 'dumbbell back movement' : 'dumbbell chest movement',
    }));

    const stable = assignStableImportKeys(largeExtraction);
    const first = createCandidateSets(stable, largeCatalog);
    const second = createCandidateSets(stable, largeCatalog);

    expect(first).toHaveLength(40);
    expect(first.every(({ candidates }) => candidates.length === 8)).toBe(true);
    expect(first.map(({ candidates }) => candidates[0].exercise.id)).toEqual(
      Array.from({ length: 40 }, (_, index) => `catalog-${index * 31}`),
    );
    expect(second).toEqual(first);
  });

  it('rejects more than 80 unique movements before catalog scoring', () => {
    const tooLarge = extraction();
    tooLarge.days[0].exercises = Array.from(
      { length: MAX_UNIQUE_IMPORT_EXERCISES + 1 },
      (_, index) => ({
        ...tooLarge.days[0].exercises[0],
        exerciseKey: `untrusted-${index}`,
        sourceTitle: `unique movement ${index + 1}`,
      }),
    );

    expect(() => createCandidateSets(assignStableImportKeys(tooLarge), catalog))
      .toThrow('at most 80 unique exercises');
  });
});

describe('normalized PDF illustration crops', () => {
  it('clamps padded normalized coordinates to page pixels', () => {
    expect(normalizedCropToPixels(
      { x: 0, y: 0.1, width: 0.25, height: 0.4 },
      100,
      200,
    )).toEqual({ x: 0, y: 16, width: 27, height: 88 });
  });

  it('copies only the requested RGBA rectangle', () => {
    const source = new Uint8Array(4 * 4 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1) source[pixel * 4] = pixel;
    const cropped = cropRgba(source, 4, 4, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(cropped).toMatchObject({ width: 4, height: 4 });
    expect(cropped.data[0]).toBe(0);
    expect(cropped.data.at(-4)).toBe(15);
  });
});
