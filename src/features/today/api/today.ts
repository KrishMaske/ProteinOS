import { supabase } from '@/lib/supabase/client';
import { withResolvedExerciseMedia } from '@/features/exercises/api/exercise-media';
import { exerciseSummary } from '@/features/exercises/exercise-reference';

type TodayRoutineDay = {
  id: string;
  name: string;
  day_index: number;
  is_rest_day: boolean;
  routine_exercises: { id: string }[];
};

type TodayRoutine = {
  id: string;
  name: string;
  current_cycle_index: number;
  routine_days: TodayRoutineDay[];
};

export async function getTodayDashboard(date: string) {
  const [profile, nutrition, target, routine, latestWeight, activeSession] = await Promise.all([
    supabase.from('profiles').select('display_name,preferred_units').single(),
    supabase.from('daily_nutrition_totals').select('*').eq('logged_date', date).maybeSingle(),
    supabase.from('nutrition_targets').select('*').lte('effective_from', date).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('workout_routines').select('id,name,current_cycle_index,routine_days(id,name,day_index,is_rest_day,routine_exercises(id))').eq('status', 'active').maybeSingle(),
    supabase.from('body_metrics').select('weight_kg,measured_at').not('weight_kg', 'is', null).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('workout_sessions').select('id,name,started_at,routine_day_id,workout_session_exercises(id,exercise_id,custom_exercise_id,exercise_index,exercise_catalog(id,name,target,equipment,image_source,gif_source),custom_exercises(id,name,target,equipment,media_path),workout_sets(id,set_index,set_type,weight_kg,reps,completed_at))').eq('status', 'in_progress').order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [profile, nutrition, target, routine, latestWeight, activeSession]) if (result.error) throw result.error;

  const activeRoutine = routine.data as unknown as TodayRoutine | null;
  let suggestedDay = null;
  if (activeRoutine?.routine_days.length) {
    const ordered = [...activeRoutine.routine_days].sort((a, b) => a.day_index - b.day_index || a.id.localeCompare(b.id));
    const cycleIndex = ((activeRoutine.current_cycle_index ?? 0) % ordered.length + ordered.length) % ordered.length;
    suggestedDay = ordered[cycleIndex];
  }

  const session = activeSession.data
    ? {
        ...activeSession.data,
        workout_session_exercises: await withResolvedExerciseMedia(
          [...activeSession.data.workout_session_exercises]
            .sort((a, b) => a.exercise_index - b.exercise_index)
            .map((exercise) => ({ ...exercise, ...exerciseSummary(exercise, exercise.exercise_catalog, exercise.custom_exercises), workout_sets: [...exercise.workout_sets].sort((a, b) => a.set_index - b.set_index) })),
        ),
      }
    : null;

  return { profile: profile.data, nutrition: nutrition.data, target: target.data, routine: activeRoutine, latestWeight: latestWeight.data, activeSession: session, suggestedDay };
}
