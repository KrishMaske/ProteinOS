import { signedMediaByPath } from '@/features/exercises/api/exercise-media';
import { supabase } from '@/lib/supabase/client';
import type { Tables } from '@/types/database';

export type ExerciseFilters = { search?: string; bodyPart?: string; target?: string; equipment?: string; page?: number };
export const EXERCISE_PAGE_SIZE = 30;
export type LibraryExercise = Tables<'exercise_library'> & { image_source: string | null; gif_source: string | null };

async function withPrivateMedia(rows: Tables<'exercise_library'>[]): Promise<LibraryExercise[]> {
  const signedByPath = await signedMediaByPath(rows.map((row) => row.media_path));
  if (!signedByPath.size) return rows as LibraryExercise[];
  return rows.map((row) => ({ ...row, image_source: row.image_source ?? (row.media_path ? signedByPath.get(row.media_path) ?? null : null) }));
}

export async function searchExercises(filters: ExerciseFilters): Promise<LibraryExercise[]> {
  const page = filters.page ?? 0;
  let query = supabase.from('exercise_library').select('*').order('name').range(page * EXERCISE_PAGE_SIZE, (page + 1) * EXERCISE_PAGE_SIZE - 1);
  if (filters.search?.trim()) query = query.ilike('name', `%${filters.search.trim()}%`);
  if (filters.bodyPart) query = query.eq('body_part', filters.bodyPart);
  if (filters.target) query = query.eq('target', filters.target);
  if (filters.equipment) query = query.eq('equipment', filters.equipment);
  const { data, error } = await query;
  if (error) throw error;
  return withPrivateMedia(data);
}

export async function getExercise(exerciseKey: string) {
  const { data, error } = await supabase.from('exercise_library').select('*').eq('exercise_key', exerciseKey).single();
  if (error) throw error;
  return (await withPrivateMedia([data]))[0];
}

export async function getExerciseHistory(exerciseKey: string) {
  const { data, error } = await supabase.from('exercise_history').select('*').eq('exercise_key', exerciseKey).order('started_at', { ascending: false }).limit(12);
  if (error) throw error;
  return data;
}

export async function getExerciseFilterOptions() {
  const { data, error } = await supabase.from('exercise_library').select('body_part,target,equipment').limit(2000);
  if (error) throw error;
  const unique = (key: 'body_part' | 'target' | 'equipment') => [...new Set(data.map((row) => row[key]).filter((value): value is string => Boolean(value)))].sort();
  return { bodyParts: unique('body_part'), targets: unique('target'), equipment: unique('equipment') };
}
