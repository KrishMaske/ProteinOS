import { supabase } from '@/lib/supabase/client';
import type { Tables } from '@/types/database';
import { withResolvedExerciseMedia } from '@/features/exercises/api/exercise-media';
import { exerciseKeyFromReference, exerciseReferenceFromKey, exerciseSummary, type ExerciseSummary } from '@/features/exercises/exercise-reference';

export type WorkoutSet = Tables<'workout_sets'>;
type RawWorkoutExercise = Tables<'workout_session_exercises'> & { exercise_catalog: ExerciseSummary | null; custom_exercises: ExerciseSummary | null; workout_sets: WorkoutSet[] };
export type WorkoutExercise = RawWorkoutExercise & { exercise: ExerciseSummary; exerciseKey: string };
export type PreviousPerformanceSet = Pick<WorkoutSet, 'weight_kg' | 'reps' | 'rpe' | 'rir' | 'set_type' | 'completed_at'>;
export type PreviousPerformance = { started_at: string; sets: PreviousPerformanceSet[] };
type Prescription = Pick<Tables<'routine_exercises'>, 'target_sets' | 'rep_min' | 'rep_max' | 'target_rir' | 'target_rpe' | 'rest_seconds'>;
export type ActiveWorkout = Tables<'workout_sessions'> & { workout_session_exercises: WorkoutExercise[]; previousByExercise: Record<string, PreviousPerformance>; prescriptionByExercise: Record<string, Prescription>; preferredUnits: 'metric' | 'imperial' };

async function callWorkoutRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as unknown;
}

function sessionIdFromRpc(data: unknown) {
  const value = Array.isArray(data) ? data[0] : data;
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['session_id', 'workout_session_id', 'id']) {
      if (typeof record[key] === 'string' && record[key]) return record[key] as string;
    }
    if (record.session && typeof record.session === 'object') return sessionIdFromRpc(record.session);
  }
  throw new Error('The workout started, but no session ID was returned. Refresh Today to resume it.');
}

export async function startWorkout(dayId: string) {
  const data = await callWorkoutRpc('start_or_resume_workout', { target_day_id: dayId });
  return { id: sessionIdFromRpc(data) };
}

export async function logActiveWorkoutSet(setId: string, weightKg: number | null, reps: number) {
  return callWorkoutRpc('log_active_workout_set', { target_set_id: setId, target_weight_kg: weightKg, target_reps: reps });
}

export async function completeRestDay(dayId: string) {
  return callWorkoutRpc('complete_rest_day', { target_day_id: dayId });
}

export async function getWorkout(id: string): Promise<ActiveWorkout> {
  const { data, error } = await supabase.from('workout_sessions').select('*, workout_session_exercises(*, exercise_catalog(id,name,target,equipment,image_source,gif_source), custom_exercises(id,name,target,equipment,media_path), workout_sets(*))').eq('id', id).single();
  if (error) throw error;
  const exercises = await withResolvedExerciseMedia(data.workout_session_exercises.map((item) => ({ ...item, ...exerciseSummary(item, item.exercise_catalog, item.custom_exercises) })));
  const exerciseKeys = exercises.map((item) => item.exerciseKey);
  const [history, prescriptions, profile] = await Promise.all([
    exerciseKeys.length ? supabase.from('exercise_history').select('exercise_key,weight_kg,reps,rpe,rir,set_type,completed_at,started_at,workout_session_id').in('exercise_key', exerciseKeys).lt('started_at', data.started_at).order('started_at', { ascending: false }).limit(Math.min(500, Math.max(80, exerciseKeys.length * 24))) : Promise.resolve({ data: [], error: null }),
    data.routine_day_id ? supabase.from('routine_exercises').select('exercise_id,custom_exercise_id,target_sets,rep_min,rep_max,target_rir,target_rpe,rest_seconds').eq('routine_day_id', data.routine_day_id) : Promise.resolve({ data: [], error: null }),
    supabase.from('profiles').select('preferred_units').single(),
  ]);
  if (history.error) throw history.error; if (prescriptions.error) throw prescriptions.error; if (profile.error) throw profile.error;
  const previousByExercise: Record<string, PreviousPerformance> = {};
  const previousSessionByExercise: Record<string, string> = {};
  for (const row of history.data ?? []) {
    if (!row.exercise_key || !row.started_at || !row.workout_session_id) continue;
    const previousSessionId = previousSessionByExercise[row.exercise_key];
    if (previousSessionId && previousSessionId !== row.workout_session_id) continue;
    previousSessionByExercise[row.exercise_key] = row.workout_session_id;
    const performance = previousByExercise[row.exercise_key] ?? { started_at: row.started_at, sets: [] };
    performance.sets.push({ weight_kg: row.weight_kg, reps: row.reps, rpe: row.rpe, rir: row.rir, set_type: row.set_type ?? 'working', completed_at: row.completed_at });
    previousByExercise[row.exercise_key] = performance;
  }
  const prescriptionByExercise = Object.fromEntries((prescriptions.data ?? []).map((row) => [exerciseKeyFromReference(row), row]));
  return { ...data, workout_session_exercises: exercises, previousByExercise, prescriptionByExercise, preferredUnits: profile.data.preferred_units as 'metric' | 'imperial' } as ActiveWorkout;
}

export async function updateWorkoutSet(id: string, values: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds' | 'rpe' | 'rir' | 'completed_at' | 'set_type'>>) { const { error } = await supabase.from('workout_sets').update(values).eq('id', id); if (error) throw error; }
export async function addWorkoutSet(exerciseId: string, nextIndex: number) { const { data, error } = await supabase.from('workout_sets').insert({ workout_session_exercise_id: exerciseId, set_index: nextIndex, set_type: 'working' }).select().single(); if (error) throw error; return data; }
export async function removeWorkoutSet(id: string) { const { error } = await supabase.from('workout_sets').delete().eq('id', id); if (error) throw error; }
export async function completeWorkout(id: string) { return callWorkoutRpc('complete_workout', { target_session_id: id }); }
export async function discardWorkout(id: string) { const { error } = await supabase.from('workout_sessions').update({ status: 'discarded' }).eq('id', id); if (error) throw error; }
export async function updateWorkoutExerciseNotes(id: string, notes: string | null) { const { error } = await supabase.from('workout_session_exercises').update({ notes }).eq('id', id); if (error) throw error; }
export async function replaceWorkoutExercise(id: string, exerciseKey: string) { const { error } = await supabase.from('workout_session_exercises').update(exerciseReferenceFromKey(exerciseKey)).eq('id', id); if (error) throw error; }

export async function getWorkoutHistory() {
  const { data, error } = await supabase.from('workout_sessions').select('id,name,started_at,duration_seconds,workout_session_exercises(id,workout_sets(weight_kg,reps,set_type,completed_at))').eq('status', 'completed').order('started_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data;
}
