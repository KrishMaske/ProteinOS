import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase/client';
import { uuid } from '@/lib/uuid';
import type { Database, Tables, TablesInsert } from '@/types/database';

export type Recipe = Tables<'recipes'>;
export type RecipeIngredient = Tables<'recipe_ingredients'>;
export type RecipeWithIngredients = Recipe & { recipe_ingredients: RecipeIngredient[] };
export type RecipeTotals = {
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  fiberGrams: number;
};

/**
 * Totals are summed from ingredients rather than stored, so they can never disagree with
 * the ingredient list. Per-serving figures divide by the recipe's yield.
 */
export function recipeTotals(ingredients: RecipeIngredient[]): RecipeTotals {
  return ingredients.reduce<RecipeTotals>((sum, item) => ({
    calories: sum.calories + Number(item.calories ?? 0),
    proteinGrams: sum.proteinGrams + Number(item.protein_grams ?? 0),
    carbohydrateGrams: sum.carbohydrateGrams + Number(item.carbohydrate_grams ?? 0),
    fatGrams: sum.fatGrams + Number(item.fat_grams ?? 0),
    fiberGrams: sum.fiberGrams + Number(item.fiber_grams ?? 0),
  }), { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0, fiberGrams: 0 });
}

export function perServing(totals: RecipeTotals, servings: number): RecipeTotals {
  const divisor = servings > 0 ? servings : 1;
  return {
    calories: totals.calories / divisor,
    proteinGrams: totals.proteinGrams / divisor,
    carbohydrateGrams: totals.carbohydrateGrams / divisor,
    fatGrams: totals.fatGrams / divisor,
    fiberGrams: totals.fiberGrams / divisor,
  };
}

export async function getRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as RecipeWithIngredients[];
}

export async function getRecipe(id: string) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as RecipeWithIngredients;
}

export type RecipeInput = {
  name: string;
  description: string | null;
  instructions: string | null;
  servings: number;
  imagePath: string | null;
  ingredients: Omit<TablesInsert<'recipe_ingredients'>, 'recipe_id' | 'position'>[];
};

async function replaceIngredients(recipeId: string, ingredients: RecipeInput['ingredients']) {
  const { error: clearError } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
  if (clearError) throw clearError;
  if (!ingredients.length) return;
  const { error } = await supabase.from('recipe_ingredients').insert(
    ingredients.map((item, index) => ({ ...item, recipe_id: recipeId, position: index })),
  );
  if (error) throw error;
}

export async function createRecipe(userId: string, input: RecipeInput) {
  const { data, error } = await supabase.from('recipes').insert({
    user_id: userId,
    name: input.name.trim(),
    description: input.description,
    instructions: input.instructions,
    servings: input.servings,
    image_path: input.imagePath,
  }).select('id').single();
  if (error) throw error;
  try {
    await replaceIngredients(data.id, input.ingredients);
  } catch (caught) {
    // A recipe with no ingredients has no macros, so it is worse than not existing.
    await supabase.from('recipes').delete().eq('id', data.id);
    throw caught;
  }
  return data.id;
}

export async function updateRecipe(id: string, input: RecipeInput) {
  const { error } = await supabase.from('recipes').update({
    name: input.name.trim(),
    description: input.description,
    instructions: input.instructions,
    servings: input.servings,
    image_path: input.imagePath,
  }).eq('id', id);
  if (error) throw error;
  await replaceIngredients(id, input.ingredients);
}

export async function deleteRecipe(id: string, imagePath: string | null) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
  if (imagePath) await supabase.storage.from('recipe-images').remove([imagePath]);
}

export async function logRecipe(
  recipeId: string,
  date: string,
  mealType: Database['public']['Enums']['meal_type'],
  servings: number,
) {
  const { data, error } = await supabase.rpc('log_recipe', {
    target_recipe_id: recipeId,
    target_logged_date: date,
    target_meal_type: mealType,
    target_servings: servings,
  });
  if (error) throw error;
  return data;
}

export async function pickRecipeImage(userId: string, source: 'camera' | 'library') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is needed to photograph the dish.');
  }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (result.canceled) return null;

  const context = ImageManipulator.ImageManipulator.manipulate(result.assets[0].uri);
  context.resize({ width: 1200, height: null });
  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({ compress: 0.78, format: ImageManipulator.SaveFormat.JPEG });
  const response = await fetch(image.uri);
  if (!response.ok) throw new Error('That photo could not be read.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('That photo was empty.');
  const path = `${userId}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from('recipe-images').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function signedRecipeImageUrl(path: string) {
  const { data } = await supabase.storage.from('recipe-images').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
