import { withResolvedExerciseMedia } from "@/features/exercises/api/exercise-media";
import {
    exerciseReferenceFromKey,
    exerciseSummary,
    type ExerciseSummary,
} from "@/features/exercises/exercise-reference";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/types/database";

type RawRoutineExercise = Tables<"routine_exercises"> & {
  exercise_catalog: ExerciseSummary | null;
  custom_exercises: ExerciseSummary | null;
};
export type RoutineExerciseWithDetails = RawRoutineExercise & {
  exercise: ExerciseSummary;
  exerciseKey: string;
};
export type RoutineDayWithExercises = Tables<"routine_days"> & {
  routine_exercises: RoutineExerciseWithDetails[];
};
export type RoutineWithDays = Tables<"workout_routines"> & {
  routine_days: RoutineDayWithExercises[];
};

export async function getRoutines() {
  const { data, error } = await supabase
    .from("workout_routines")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getRoutine(id: string): Promise<RoutineWithDays> {
  const { data, error } = await supabase
    .from("workout_routines")
    .select(
      "*, routine_days(*, routine_exercises(*, exercise_catalog(id,name,target,equipment,image_source,gif_source), custom_exercises(id,name,target,equipment,media_path)))",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  const days = await Promise.all(
    data.routine_days.map(async (day) => ({
      ...day,
      routine_exercises: await withResolvedExerciseMedia(
        day.routine_exercises.map((item) => ({
          ...item,
          ...exerciseSummary(item, item.exercise_catalog, item.custom_exercises),
        })),
      ),
    })),
  );
  return { ...data, routine_days: days } as RoutineWithDays;
}

export async function createRoutine(userId: string, name: string) {
  const { data: routine, error } = await supabase
    .from("workout_routines")
    .insert({
      user_id: userId,
      name: name.trim(),
      status: "draft",
      source: "manual",
    })
    .select()
    .single();
  if (error) throw error;
  const { error: dayError } = await supabase
    .from("routine_days")
    .insert({ routine_id: routine.id, name: "Day 1", day_index: 0 });
  if (dayError) {
    await supabase.from("workout_routines").delete().eq("id", routine.id);
    throw dayError;
  }
  return routine;
}

export async function addRoutineDay(
  routineId: string,
  dayIndex: number,
  isRestDay = false,
) {
  const { data, error } = await supabase
    .from("routine_days")
    .insert({
      routine_id: routineId,
      name: isRestDay ? "Rest" : `Day ${dayIndex + 1}`,
      day_index: dayIndex,
      is_rest_day: isRestDay,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameRoutine(id: string, name: string) {
  const { error } = await supabase
    .from("workout_routines")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function renameRoutineDay(dayId: string, name: string) {
  const { error } = await supabase
    .from("routine_days")
    .update({ name: name.trim() })
    .eq("id", dayId);
  if (error) throw error;
}

export async function addExerciseToDay(
  dayId: string,
  exerciseKey: string,
  exerciseIndex: number,
) {
  const reference = exerciseReferenceFromKey(exerciseKey);
  const { error } = await supabase
    .from("routine_exercises")
    .insert({
      routine_day_id: dayId,
      ...reference,
      exercise_index: exerciseIndex,
      target_sets: 3,
      rep_min: 8,
      rep_max: 12,
      rest_seconds: 90,
      target_rir: 2,
    });
  if (error) throw error;
}

export async function updateRoutineExercise(
  id: string,
  values: Partial<
    Pick<
      Tables<"routine_exercises">,
      | "target_sets"
      | "rep_min"
      | "rep_max"
      | "rest_seconds"
      | "target_rpe"
      | "target_rir"
      | "notes"
    >
  >,
) {
  const { error } = await supabase
    .from("routine_exercises")
    .update(values)
    .eq("id", id);
  if (error) throw error;
}

export async function removeRoutineExercise(id: string) {
  const { error } = await supabase
    .from("routine_exercises")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function reorderRoutineExercises(
  dayId: string,
  orderedIds: string[],
) {
  const { error } = await supabase.rpc("reorder_routine_exercises", {
    target_day_id: dayId,
    ordered_exercise_ids: orderedIds,
  });
  if (error) throw error;
}

export async function reorderRoutineDays(
  routineId: string,
  orderedIds: string[],
) {
  const { error } = await supabase.rpc("reorder_routine_days", {
    target_routine_id: routineId,
    ordered_day_ids: orderedIds,
  });
  if (error) throw error;
}

export async function duplicateRoutineDay(day: RoutineDayWithExercises) {
  const { data: siblingDays, error: countError } = await supabase
    .from("routine_days")
    .select("day_index")
    .eq("routine_id", day.routine_id)
    .order("day_index", { ascending: false })
    .limit(1);
  if (countError) throw countError;
  const nextIndex = (siblingDays[0]?.day_index ?? -1) + 1;
  const { data: created, error } = await supabase
    .from("routine_days")
    .insert({
      routine_id: day.routine_id,
      name: day.is_rest_day ? "Rest" : `${day.name} copy`,
      day_index: nextIndex,
      notes: day.notes,
      is_rest_day: day.is_rest_day,
    })
    .select()
    .single();
  if (error) throw error;
  if (day.routine_exercises.length) {
    const { error: exerciseError } = await supabase
      .from("routine_exercises")
      .insert(
        day.routine_exercises.map((item) => ({
          routine_day_id: created.id,
          exercise_id: item.exercise_id,
          custom_exercise_id: item.custom_exercise_id,
          exercise_index: item.exercise_index,
          target_sets: item.target_sets,
          rep_min: item.rep_min,
          rep_max: item.rep_max,
          rest_seconds: item.rest_seconds,
          target_rpe: item.target_rpe,
          target_rir: item.target_rir,
          notes: item.notes,
        })),
      );
    if (exerciseError) throw exerciseError;
  }
}

export async function duplicateRoutine(
  routine: RoutineWithDays,
  userId: string,
) {
  const created = await createRoutine(userId, `${routine.name} copy`);
  const { data: defaultDay } = await supabase
    .from("routine_days")
    .select("id")
    .eq("routine_id", created.id)
    .single();
  if (defaultDay)
    await supabase.from("routine_days").delete().eq("id", defaultDay.id);
  for (const day of [...routine.routine_days].sort(
    (a, b) => a.day_index - b.day_index,
  )) {
    const { data: newDay, error } = await supabase
      .from("routine_days")
      .insert({
        routine_id: created.id,
        name: day.name,
        day_index: day.day_index,
        notes: day.notes,
        is_rest_day: day.is_rest_day,
      })
      .select()
      .single();
    if (error) throw error;
    if (day.routine_exercises.length) {
      const { error: exerciseError } = await supabase
        .from("routine_exercises")
        .insert(
          day.routine_exercises.map((item) => ({
            routine_day_id: newDay.id,
            exercise_id: item.exercise_id,
            custom_exercise_id: item.custom_exercise_id,
            exercise_index: item.exercise_index,
            target_sets: item.target_sets,
            rep_min: item.rep_min,
            rep_max: item.rep_max,
            rest_seconds: item.rest_seconds,
            target_rpe: item.target_rpe,
            target_rir: item.target_rir,
            notes: item.notes,
          })),
        );
      if (exerciseError) throw exerciseError;
    }
  }
  return created;
}

export async function activateRoutine(id: string) {
  const { error } = await supabase.rpc("activate_routine", {
    target_routine_id: id,
  });
  if (error) throw error;
}
export async function deactivateRoutine(id: string) {
  const { data, error } = await supabase
    .from("workout_routines")
    .update({ status: "draft" })
    .eq("id", id)
    .eq("status", "active")
    .select("id,status")
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      "This routine is no longer active or could not be updated.",
    );
  return data;
}
export async function archiveRoutine(id: string) {
  const { error } = await supabase
    .from("workout_routines")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw error;
}
export async function deleteRoutine(id: string) {
  const { error } = await supabase
    .from("workout_routines")
    .delete()
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw error;
}
