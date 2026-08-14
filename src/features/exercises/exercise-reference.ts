export type ExerciseReference = {
  exercise_id: string | null;
  custom_exercise_id: string | null;
};

export type ExerciseSummary = {
  id: string;
  name: string;
  target: string | null;
  equipment: string | null;
  image_source?: string | null;
  gif_source?: string | null;
  media_path?: string | null;
};

export function exerciseKeyFromReference(reference: ExerciseReference) {
  if (reference.exercise_id) return `catalog:${reference.exercise_id}`;
  if (reference.custom_exercise_id)
    return `custom:${reference.custom_exercise_id}`;
  throw new Error("Exercise reference is missing.");
}

export function exerciseReferenceFromKey(
  exerciseKey: string,
): ExerciseReference {
  const separator = exerciseKey.indexOf(":");
  const kind = exerciseKey.slice(0, separator);
  const id = exerciseKey.slice(separator + 1);
  if (!id || (kind !== "catalog" && kind !== "custom"))
    throw new Error("Choose a valid exercise.");
  return kind === "catalog"
    ? { exercise_id: id, custom_exercise_id: null }
    : { exercise_id: null, custom_exercise_id: id };
}

export function exerciseSummary(
  reference: ExerciseReference,
  catalog: ExerciseSummary | null,
  custom: ExerciseSummary | null,
) {
  const exercise = catalog ?? custom;
  if (!exercise) throw new Error("The selected exercise is unavailable.");
  return { exercise, exerciseKey: exerciseKeyFromReference(reference) };
}
