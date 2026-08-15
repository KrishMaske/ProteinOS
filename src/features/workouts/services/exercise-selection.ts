type ExerciseProgress = {
  id: string;
  workout_sets: { completed_at: string | null; skipped_at?: string | null }[];
};

/** A set is settled once it is logged or deliberately passed over. */
export function isSetOutstanding(set: { completed_at: string | null; skipped_at?: string | null }) {
  return !set.completed_at && !set.skipped_at;
}

export function initialWorkoutExerciseId(exercises: ExerciseProgress[]) {
  // Opens on the first exercise still holding work, so skipping one moves past it.
  return exercises.find((exercise) => exercise.workout_sets.some(isSetOutstanding))?.id ?? exercises[0]?.id ?? null;
}

export function resolveWorkoutExercise<T extends { id: string }>(exercises: T[], selectedId: string | null | undefined) {
  return exercises.find((exercise) => exercise.id === selectedId) ?? null;
}
