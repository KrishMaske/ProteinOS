import { ageFromBirthDate, calculateNutritionTargets, summarizeWeightTrend } from '@/features/nutrition/services/nutrition-targets';
import { localDateKey } from '@/lib/date';
import { supabase } from '@/lib/supabase/client';
import type { Database, TablesUpdate } from '@/types/database';

/** Window used for the weight trend and the intake average behind adaptive maintenance. */
const TREND_WINDOW_DAYS = 28;

export async function getSettings() {
  const today = localDateKey();
  const windowStart = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [profile, goal, latestWeight, weights, target, intake] = await Promise.all([
    supabase.from('profiles').select('display_name,preferred_units,delete_food_photo_after_analysis,training_days_per_week,preferred_session_minutes,birth_date,height_cm,biological_sex,target_weight_kg').single(),
    supabase.from('fitness_goals').select('goal_type,notes').eq('is_active', true).maybeSingle(),
    // Deliberately unbounded: someone who last weighed in months ago still has a weight,
    // and the trend window below must not decide whether targets can be derived at all.
    supabase.from('body_metrics').select('weight_kg,measured_at').not('weight_kg', 'is', null).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('body_metrics').select('weight_kg,measured_at').not('weight_kg', 'is', null).gte('measured_at', windowStart.toISOString()).order('measured_at', { ascending: false }),
    supabase.from('nutrition_targets').select('*').lte('effective_from', today).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('daily_nutrition_totals').select('logged_date,calories').gte('logged_date', localDateKey(windowStart)).lt('logged_date', today),
  ]);
  for (const result of [profile, goal, latestWeight, weights, target, intake]) if (result.error) throw result.error;
  if (!profile.data) throw new Error('Profile not found');

  const recentWeights = weights.data ?? [];
  const loggedDays = (intake.data ?? []).filter((day) => Number(day.calories) > 0);
  return {
    profile: profile.data,
    goal: goal.data,
    latestWeight: latestWeight.data,
    target: target.data,
    trend: summarizeWeightTrend(
      recentWeights.map((row) => ({ measuredAt: row.measured_at, weightKg: Number(row.weight_kg) })),
    ),
    intake: loggedDays.length
      ? {
          averageDailyCalories: loggedDays.reduce((sum, day) => sum + Number(day.calories), 0) / loggedDays.length,
          loggedDays: loggedDays.length,
        }
      : null,
  };
}

type SettingsData = Awaited<ReturnType<typeof getSettings>>;

/**
 * Onboarding writes targets once, so weight, goal, and training-volume changes need an
 * explicit re-derivation. Feeds every signal we hold — the smoothed weight trend, logged
 * intake, goal weight, height, age, sex, and training volume — into the calculator.
 * Returns null only when a required input is missing entirely.
 */
export function estimateTargetsFromSettings({ profile, goal, latestWeight, trend, intake }: SettingsData) {
  const weightKg = latestWeight?.weight_kg === null || latestWeight?.weight_kg === undefined ? null : Number(latestWeight.weight_kg);
  const heightCm = profile.height_cm === null ? null : Number(profile.height_cm);
  if (!weightKg || !heightCm || !profile.birth_date) return null;
  return calculateNutritionTargets({
    weightKg,
    heightCm,
    age: ageFromBirthDate(profile.birth_date),
    biologicalSex: profile.biological_sex,
    trainingDaysPerWeek: profile.training_days_per_week,
    goalType: goal?.goal_type ?? null,
    targetWeightKg: profile.target_weight_kg === null ? null : Number(profile.target_weight_kg),
    trend,
    intake,
  });
}

export type BodyMeasurements = {
  heightCm: number | null;
  targetWeightKg: number | null;
  weightKg: number | null;
};

/**
 * Height and goal weight live on the profile; a new current weight becomes a body_metrics
 * reading so the progress chart and target recalculation both see it.
 */
export async function updateBodyMeasurements({ heightCm, targetWeightKg, weightKg }: BodyMeasurements) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Authentication expired');
  const { error } = await supabase
    .from('profiles')
    .update({ height_cm: heightCm, target_weight_kg: targetWeightKg })
    .eq('id', user.user.id);
  if (error) throw error;
  if (weightKg === null) return;
  const { error: metricError } = await supabase
    .from('body_metrics')
    .insert({ user_id: user.user.id, measured_at: new Date().toISOString(), weight_kg: weightKg });
  if (metricError) throw metricError;
}

export async function recalculateNutritionTargets() {
  const settings = await getSettings();
  const estimate = estimateTargetsFromSettings(settings);
  if (!estimate) throw new Error('Add your height, birth date, and a logged weight before recalculating targets.');
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Authentication expired');
  const { error } = await supabase.from('nutrition_targets').upsert({
    user_id: user.user.id,
    calories: estimate.calories,
    protein_grams: estimate.proteinGrams,
    carbohydrate_grams: estimate.carbohydrateGrams,
    fat_grams: estimate.fatGrams,
    fiber_grams: estimate.fiberGrams,
    effective_from: localDateKey(),
  }, { onConflict: 'user_id,effective_from' });
  if (error) throw error;
  return estimate;
}

export async function updateSettings(values: TablesUpdate<'profiles'>) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Authentication expired');
  const { error } = await supabase.from('profiles').update(values).eq('id', user.user.id);
  if (error) throw error;
}

export async function setFitnessGoal(goalType: Database['public']['Enums']['goal_type']) {
  // preserve_existing_notes keeps whatever notes are already stored, so target_notes is unused here.
  const { data, error } = await supabase.rpc('set_fitness_goal', { target_goal_type: goalType, preserve_existing_notes: true });
  if (error) throw error;
  return data;
}
