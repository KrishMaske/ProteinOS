import { supabase } from '@/lib/supabase/client';
import type { Tables, TablesInsert } from '@/types/database';

export type Gym = Tables<'gyms'>;
export type GymExercisePerformance = Tables<'gym_exercise_performance'>;

export async function getGyms() {
  const { data, error } = await supabase
    .from('gyms')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createGym(userId: string, values: Pick<TablesInsert<'gyms'>, 'name' | 'notes' | 'is_default'>) {
  // A first gym becomes the default on its own, otherwise nothing would be stamped
  // onto sessions until the user thought to set one.
  const existing = await supabase.from('gyms').select('id').limit(1);
  if (existing.error) throw existing.error;
  const isDefault = values.is_default ?? existing.data.length === 0;
  if (isDefault) await clearDefault();

  const { data, error } = await supabase
    .from('gyms')
    .insert({ user_id: userId, name: values.name.trim(), notes: values.notes ?? null, is_default: isDefault })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGym(id: string, values: Pick<TablesInsert<'gyms'>, 'name' | 'notes'>) {
  const { error } = await supabase
    .from('gyms')
    .update({ name: values.name.trim(), notes: values.notes ?? null })
    .eq('id', id);
  if (error) throw error;
}

/** Cleared first because a partial unique index allows only one default per user. */
async function clearDefault() {
  const { error } = await supabase.from('gyms').update({ is_default: false }).eq('is_default', true);
  if (error) throw error;
}

export async function setDefaultGym(id: string) {
  await clearDefault();
  const { error } = await supabase.from('gyms').update({ is_default: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteGym(id: string) {
  // Sessions keep their history; gym_id is set null by the foreign key, which reads as
  // "unrecorded" rather than being confused with another gym.
  const { error } = await supabase.from('gyms').delete().eq('id', id);
  if (error) throw error;
}

/** Moves a session to another gym, or clears it when the gym is unknown. */
export async function setSessionGym(sessionId: string, gymId: string | null) {
  const { error } = await supabase.from('workout_sessions').update({ gym_id: gymId }).eq('id', sessionId);
  if (error) throw error;
}

/**
 * Per-gym performance for one exercise, newest activity first. This is the comparison
 * behind "does this feel heavier here", and the shape a model would later train on.
 */
export async function getGymComparison(exerciseKey?: string) {
  let query = supabase.from('gym_exercise_performance').select('*').order('last_logged_at', { ascending: false });
  if (exerciseKey) query = query.eq('exercise_key', exerciseKey);
  const { data, error } = await query.limit(200);
  if (error) throw error;
  return data ?? [];
}

export type GymSubstitution = Tables<'gym_exercise_substitutions'>;

/** Every standing swap for a gym, so the workout screen can show what will change. */
export async function getGymSubstitutions(gymId: string) {
  const { data, error } = await supabase
    .from('gym_exercise_substitutions')
    .select('*')
    .eq('gym_id', gymId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Records "at this gym, use B instead of A". Upserted on the gym and source exercise so
 * changing your mind replaces the rule rather than stacking a second one.
 */
export async function setGymSubstitution(
  userId: string,
  gymId: string,
  from: { exercise_id: string | null; custom_exercise_id: string | null },
  toExerciseKey: string,
) {
  const separator = toExerciseKey.indexOf(':');
  const kind = toExerciseKey.slice(0, separator);
  const id = toExerciseKey.slice(separator + 1);
  const { error } = await supabase.from('gym_exercise_substitutions').upsert({
    user_id: userId,
    gym_id: gymId,
    exercise_id: from.exercise_id,
    custom_exercise_id: from.custom_exercise_id,
    substitute_exercise_id: kind === 'catalog' ? id : null,
    substitute_custom_exercise_id: kind === 'custom' ? id : null,
  }, { onConflict: 'gym_id,exercise_id,custom_exercise_id' });
  if (error) throw error;
}

export async function removeGymSubstitution(id: string) {
  const { error } = await supabase.from('gym_exercise_substitutions').delete().eq('id', id);
  if (error) throw error;
}
