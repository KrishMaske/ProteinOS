import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { EditableBodyMetric } from '@/features/progress/services/body-metric-form';
import { supabase } from '@/lib/supabase/client';
import type { TablesInsert } from '@/types/database';
import { uuid } from '@/lib/uuid';

export async function getProgressDashboard() {
  const [metrics, training, bests, profile, nutrition, target] = await Promise.all([
    supabase.from('body_metrics').select('*').order('measured_at', { ascending: true }).limit(180),
    supabase.from('weekly_workout_summary').select('*').order('week_start', { ascending: true }).limit(26),
    supabase.from('personal_bests').select('*').order('estimated_one_rep_max', { ascending: false }).limit(8),
    supabase.from('profiles').select('preferred_units,height_cm,birth_date,biological_sex').single(),
    supabase.from('daily_nutrition_totals').select('logged_date,protein_grams').order('logged_date', { ascending: false }).limit(30),
    supabase.from('nutrition_targets').select('protein_grams').order('effective_from', { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const result of [metrics, training, bests, profile, nutrition, target]) if (result.error) throw result.error;
  return { metrics: metrics.data ?? [], training: training.data ?? [], bests: bests.data ?? [], preferredUnits: profile.data?.preferred_units ?? 'metric', profile: profile.data, nutrition: nutrition.data ?? [], proteinTarget: target.data?.protein_grams ?? null };
}

export async function createBodyMetric(input: TablesInsert<'body_metrics'>) {
  const { data, error } = await supabase.from('body_metrics').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateBodyMetric(id: string, userId: string, input: EditableBodyMetric) {
  const { data, error } = await supabase
    .from('body_metrics')
    .update(input)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This measurement could not be found.');
  return data;
}

export async function deleteBodyMetric(id: string, userId: string) {
  const { data, error } = await supabase
    .from('body_metrics')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This measurement could not be found.');
}

export async function pickAndSaveProgressPhoto(userId: string) {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (result.canceled) return null;
  const context = ImageManipulator.ImageManipulator.manipulate(result.assets[0].uri);
  context.resize({ width: 1600, height: null });
  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({ compress: 0.82, format: ImageManipulator.SaveFormat.JPEG });
  const response = await fetch(image.uri);
  if (!response.ok) throw new Error('The selected photo could not be read.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The selected photo was empty. Please choose it again.');
  const storagePath = `${userId}/${uuid()}.jpg`;
  const { error: uploadError } = await supabase.storage.from('progress-photos').upload(storagePath, bytes, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from('progress_photos').insert({ user_id: userId, storage_path: storagePath }).select().single();
  if (error) {
    await supabase.storage.from('progress-photos').remove([storagePath]);
    throw error;
  }
  return data;
}
