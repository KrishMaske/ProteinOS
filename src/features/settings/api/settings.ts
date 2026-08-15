import { ageFromBirthDate, calculateNutritionTargets, summarizeWeightTrend } from '@/features/nutrition/services/nutrition-targets';
import { estimateBodyFat } from '@/features/progress/services/body-composition';
import { localDateKey } from '@/lib/date';
import { supabase } from '@/lib/supabase/client';
import type { Database, TablesUpdate } from '@/types/database';

/** Window used for the weight trend and the intake average behind adaptive maintenance. */
const TREND_WINDOW_DAYS = 28;

export async function getSettings() {
  const today = localDateKey();
  const windowStart = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [profile, goal, latestWeight, weights, latestWaist, target, intake] = await Promise.all([
    supabase.from('profiles').select('display_name,preferred_units,delete_food_photo_after_analysis,training_days_per_week,preferred_session_minutes,birth_date,height_cm,biological_sex,target_weight_kg,goal_body_fat_min,goal_body_fat_max,daily_activity_level').single(),
    supabase.from('fitness_goals').select('goal_type,notes').eq('is_active', true).maybeSingle(),
    // Deliberately unbounded: someone who last weighed in months ago still has a weight,
    // and the trend window below must not decide whether targets can be derived at all.
    supabase.from('body_metrics').select('weight_kg,measured_at').not('weight_kg', 'is', null).order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('body_metrics').select('weight_kg,measured_at').not('weight_kg', 'is', null).gte('measured_at', windowStart.toISOString()).order('measured_at', { ascending: false }),
    // Newest row carrying a waist or a measured body fat, so composition can be estimated
    // even when the latest weigh-in had neither.
    supabase.from('body_metrics').select('waist_cm,body_fat_percent,measured_at').or('waist_cm.not.is.null,body_fat_percent.not.is.null').order('measured_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('nutrition_targets').select('*').lte('effective_from', today).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('daily_nutrition_totals').select('logged_date,calories').gte('logged_date', localDateKey(windowStart)).lt('logged_date', today),
  ]);
  for (const result of [profile, goal, latestWeight, weights, latestWaist, target, intake]) if (result.error) throw result.error;
  if (!profile.data) throw new Error('Profile not found');

  const recentWeights = weights.data ?? [];
  const loggedDays = (intake.data ?? []).filter((day) => Number(day.calories) > 0);
  return {
    profile: profile.data,
    goal: goal.data,
    latestWeight: latestWeight.data,
    latestWaist: latestWaist.data,
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
export function estimateTargetsFromSettings({ profile, goal, latestWeight, latestWaist, trend, intake }: SettingsData) {
  const weightKg = latestWeight?.weight_kg === null || latestWeight?.weight_kg === undefined ? null : Number(latestWeight.weight_kg);
  const heightCm = profile.height_cm === null ? null : Number(profile.height_cm);
  if (!weightKg || !heightCm || !profile.birth_date) return null;
  const age = ageFromBirthDate(profile.birth_date);
  const bodyFat = estimateBodyFat({
    weightKg,
    heightCm,
    age,
    biologicalSex: profile.biological_sex,
    waistCm: latestWaist?.waist_cm === null || latestWaist?.waist_cm === undefined ? null : Number(latestWaist.waist_cm),
    measuredBodyFatPercent: latestWaist?.body_fat_percent === null || latestWaist?.body_fat_percent === undefined ? null : Number(latestWaist.body_fat_percent),
  });
  return calculateNutritionTargets({
    weightKg,
    heightCm,
    age,
    biologicalSex: profile.biological_sex,
    trainingDaysPerWeek: profile.training_days_per_week,
    sessionMinutes: profile.preferred_session_minutes,
    dailyActivityLevel: profile.daily_activity_level,
    goalType: goal?.goal_type ?? null,
    targetWeightKg: profile.target_weight_kg === null ? null : Number(profile.target_weight_kg),
    bodyFatPercent: bodyFat?.percent ?? null,
    goalBodyFat: goalBodyFatBand(profile),
    trend,
    intake,
  });
}

/** Both bounds are written together, so either being null means no band is set. */
export function goalBodyFatBand(profile: { goal_body_fat_min: number | null; goal_body_fat_max: number | null }) {
  const { goal_body_fat_min: min, goal_body_fat_max: max } = profile;
  return min === null || max === null ? null : { min: Number(min), max: Number(max) };
}

export type BodyMeasurements = {
  heightCm: number | null;
  targetWeightKg: number | null;
  weightKg: number | null;
  /** Whole years. Null leaves the stored birth date alone. */
  age?: number | null;
};

/**
 * Only an age is collected, so the stored birth date keeps the existing month and day and
 * moves the year. That way a correction does not silently reset the anniversary, and the
 * age still ticks over on the right date.
 */
export function birthDateForAge(age: number, existing: string | null, today = new Date()) {
  const anchor = existing ? new Date(`${existing}T00:00:00`) : today;
  const month = anchor.getMonth();
  const day = anchor.getDate();
  const hadBirthdayThisYear =
    today.getMonth() > month || (today.getMonth() === month && today.getDate() >= day);
  const year = today.getFullYear() - age - (hadBirthdayThisYear ? 0 : 1);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Height and goal weight live on the profile; a new current weight becomes a body_metrics
 * reading so the progress chart and target recalculation both see it.
 */
export async function updateBodyMeasurements({ heightCm, targetWeightKg, weightKg, age }: BodyMeasurements) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Authentication expired');
  let birthDate: string | undefined;
  if (age !== null && age !== undefined) {
    const { data: current } = await supabase.from('profiles').select('birth_date').eq('id', user.user.id).single();
    birthDate = birthDateForAge(age, current?.birth_date ?? null);
  }
  const { error } = await supabase
    .from('profiles')
    .update({ height_cm: heightCm, target_weight_kg: targetWeightKg, ...(birthDate ? { birth_date: birthDate } : {}) })
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
