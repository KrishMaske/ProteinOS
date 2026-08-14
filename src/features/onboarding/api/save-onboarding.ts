import { supabase } from '@/lib/supabase/client';
import { calculateNutritionTargets } from '@/features/nutrition/services/nutrition-targets';
import type { OnboardingValues } from '@/features/onboarding/schema';
import { localDateKey } from '@/lib/date';

const INCHES_TO_CM = 2.54;
const POUNDS_TO_KG = 0.45359237;

function chosen(entered: number | '' | undefined, estimate: number) {
  return entered === '' || entered === undefined ? estimate : entered;
}

export async function saveOnboarding(userId: string, values: OnboardingValues) {
  const heightCm = values.preferredUnits === 'imperial' ? values.height * INCHES_TO_CM : values.height;
  const weightKg = values.preferredUnits === 'imperial' ? values.weight * POUNDS_TO_KG : values.weight;
  const birthDate = new Date();
  birthDate.setUTCFullYear(birthDate.getUTCFullYear() - values.age);

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('id,onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle();
  if (existingProfileError) throw existingProfileError;
  if (existingProfile?.onboarding_completed_at) return { alreadyCompleted: true } as const;

  const profileValues = {
    id: userId,
    display_name: values.displayName,
    birth_date: birthDate.toISOString().slice(0, 10),
    height_cm: heightCm,
    biological_sex: values.biologicalSex,
    preferred_units: values.preferredUnits,
    training_experience: values.trainingExperience,
    training_days_per_week: values.trainingDaysPerWeek,
    preferred_session_minutes: values.preferredSessionMinutes,
    available_equipment: splitList(values.equipment),
    exercises_to_avoid: splitList(values.exercisesToAvoid),
    diet_preference: values.dietPreference || null,
  };
  const { error: profileError } = existingProfile
    ? await supabase.from('profiles').update(profileValues).eq('id', userId)
    : await supabase.from('profiles').insert(profileValues);
  if (profileError) throw profileError;

  // target_notes defaults to NULL, so omitting it is the same as clearing it.
  const { error: goalError } = await supabase.rpc('set_fitness_goal', { target_goal_type: values.goalType, preserve_existing_notes: false });
  if (goalError) throw goalError;

  // Anything the user left blank is derived from their body and goal rather than a flat default.
  const estimated = calculateNutritionTargets({
    weightKg,
    heightCm,
    age: values.age,
    biologicalSex: values.biologicalSex,
    trainingDaysPerWeek: values.trainingDaysPerWeek,
    goalType: values.goalType,
  });
  const { error: targetError } = await supabase.from('nutrition_targets').upsert({
    user_id: userId,
    calories: chosen(values.calorieTarget, estimated.calories),
    protein_grams: chosen(values.proteinTarget, estimated.proteinGrams),
    carbohydrate_grams: chosen(values.carbohydrateTarget, estimated.carbohydrateGrams),
    fat_grams: chosen(values.fatTarget, estimated.fatGrams),
    fiber_grams: estimated.fiberGrams,
    effective_from: localDateKey(),
  }, { onConflict: 'user_id,effective_from' });
  if (targetError) throw targetError;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const { data: existingMetric, error: existingMetricError } = await supabase
    .from('body_metrics')
    .select('id')
    .eq('user_id', userId)
    .eq('weight_kg', weightKg)
    .gte('measured_at', startOfToday.toISOString())
    .lt('measured_at', startOfTomorrow.toISOString())
    .limit(1)
    .maybeSingle();
  if (existingMetricError) throw existingMetricError;
  if (!existingMetric) {
    const { error: metricError } = await supabase.from('body_metrics').insert({ user_id: userId, measured_at: now.toISOString(), weight_kg: weightKg });
    if (metricError) throw metricError;
  }

  const { error: completionError } = await supabase
    .from('profiles')
    .update({ onboarding_completed_at: now.toISOString() })
    .eq('id', userId)
    .is('onboarding_completed_at', null);
  if (completionError) throw completionError;

  return { alreadyCompleted: false } as const;
}

function splitList(value: string) {
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}
