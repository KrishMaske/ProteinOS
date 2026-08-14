import { describe, expect, it } from 'vitest';

import { initialWorkoutExerciseId, resolveWorkoutExercise } from './exercise-selection';

describe('active workout exercise selection', () => {
  const exercises = [
    { id: 'a', workout_sets: [{ completed_at: 'done' }] },
    { id: 'b', workout_sets: [{ completed_at: null }] },
    { id: 'c', workout_sets: [{ completed_at: null }] },
  ];

  it('opens the first incomplete exercise initially', () => {
    expect(initialWorkoutExerciseId(exercises)).toBe('b');
  });

  it('keeps an explicit selection when progress changes after a refetch', () => {
    const refreshed = exercises.map((exercise) => exercise.id === 'b'
      ? { ...exercise, workout_sets: [{ completed_at: 'now-done' }] }
      : exercise);
    expect(initialWorkoutExerciseId(refreshed)).toBe('c');
    expect(resolveWorkoutExercise(refreshed, 'b')?.id).toBe('b');
  });

  it('does not silently jump when an explicit exercise is missing', () => {
    expect(resolveWorkoutExercise(exercises, 'removed')).toBeNull();
  });
});
