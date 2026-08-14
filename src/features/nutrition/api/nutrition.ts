import { supabase } from '@/lib/supabase/client';
import type { FoodAnalysis } from '@/lib/openai-types/food-analysis';
import type { Database, TablesInsert, TablesUpdate } from '@/types/database';

export async function getDailyNutrition(date: string) {
  const [totals, logs, target] = await Promise.all([
    supabase.from('daily_nutrition_totals').select('*').eq('logged_date', date).maybeSingle(),
    supabase.from('food_logs').select('*, food_log_items(*)').eq('logged_date', date).order('created_at'),
    supabase.from('nutrition_targets').select('*').lte('effective_from', date).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (totals.error) throw totals.error; if (logs.error) throw logs.error; if (target.error) throw target.error;
  return { totals: totals.data, logs: logs.data, target: target.data };
}

export async function createFoodLog(userId: string, log: TablesInsert<'food_logs'>, items: TablesInsert<'food_log_items'>[]) {
  const { data, error } = await supabase.from('food_logs').insert({ ...log, user_id: userId }).select().single();
  if (error) throw error;
  const { error: itemsError } = await supabase.from('food_log_items').insert(items.map((item) => ({ ...item, food_log_id: data.id })));
  if (itemsError) { await supabase.from('food_logs').delete().eq('id', data.id); throw itemsError; }
  return data;
}

export async function saveFoodAnalysis(userId: string, date: string, mealType: TablesInsert<'food_logs'>['meal_type'], analysis: FoodAnalysis, photoPath: string | null) {
  return createFoodLog(userId, { user_id: userId, logged_date: date, meal_type: mealType, name: analysis.mealName, source: 'photo_estimate', photo_path: photoPath }, analysis.foods.map((food) => ({ food_log_id: '', name: food.name, quantity: food.estimatedQuantity, unit: food.unit, grams: food.estimatedGrams, calories: food.calories, protein_grams: food.proteinGrams, carbohydrate_grams: food.carbohydrateGrams, fat_grams: food.fatGrams, fiber_grams: food.fiberGrams, confidence: food.confidence, estimate_note: `Estimated from photo — ${food.reasoningSummary}` })));
}

export async function getFoodLog(id: string) { const { data, error } = await supabase.from('food_logs').select('*,food_log_items(*)').eq('id', id).single(); if (error) throw error; return data; }
export async function updateFoodLog(id: string, values: Partial<Pick<TablesInsert<'food_logs'>, 'name' | 'meal_type'>>) { const { error } = await supabase.from('food_logs').update(values).eq('id', id); if (error) throw error; }
export async function updateFoodItem(id: string, values: Partial<Pick<TablesInsert<'food_log_items'>, 'name' | 'grams' | 'calories' | 'protein_grams' | 'carbohydrate_grams' | 'fat_grams' | 'fiber_grams'>>) { const { error } = await supabase.from('food_log_items').update(values).eq('id', id); if (error) throw error; }
export async function deleteFoodLog(id: string, photoPath: string | null) { const { error } = await supabase.from('food_logs').delete().eq('id', id); if (error) throw error; if (photoPath) await supabase.storage.from('food-photos').remove([photoPath]); }

export async function getSavedFoods() {
  const { data, error } = await supabase
    .from('saved_foods')
    .select('*')
    .order('last_logged_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

export async function getSavedFood(id: string) {
  const { data, error } = await supabase.from('saved_foods').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createSavedFood(values: TablesInsert<'saved_foods'>) {
  const { data, error } = await supabase.from('saved_foods').insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateSavedFood(id: string, values: TablesUpdate<'saved_foods'>) {
  const { data, error } = await supabase.from('saved_foods').update(values).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSavedFood(id: string) {
  const { error } = await supabase.from('saved_foods').delete().eq('id', id);
  if (error) throw error;
}

export async function logSavedFood(id: string, date: string, mealType: Database['public']['Enums']['meal_type']) {
  const { data, error } = await supabase.rpc('log_saved_food', {
    target_saved_food_id: id,
    target_logged_date: date,
    target_meal_type: mealType,
  });
  if (error) throw error;
  return data;
}
