type ExerciseProgress = {
  id: string;
  workout_sets: { completed_at: string | null }[];
};

export function initialWorkoutExerciseId(exercises: ExerciseProgress[]) {
  return exercises.find((exercise) => exercise.workout_sets.some((set) => !set.completed_at))?.id ?? exercises[0]?.id ?? null;
}

export function resolveWorkoutExercise<T extends { id: string }>(exercises: T[], selectedId: string | null | undefined) {
  return exercises.find((exercise) => exercise.id === selectedId) ?? null;
}
