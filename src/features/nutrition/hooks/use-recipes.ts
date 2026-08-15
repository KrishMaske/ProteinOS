import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  getRecipes,
  logRecipe,
  updateRecipe,
  type RecipeInput,
} from '@/features/nutrition/api/recipes';

export const recipeKeys = {
  all: ['recipes'] as const,
  detail: (id: string) => ['recipes', id] as const,
};

export function useRecipes() {
  return useQuery({ queryKey: recipeKeys.all, queryFn: getRecipes });
}

export function useRecipe(id: string) {
  return useQuery({ queryKey: recipeKeys.detail(id), queryFn: () => getRecipe(id), enabled: Boolean(id) });
}

export function useCreateRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: RecipeInput }) => createRecipe(userId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: recipeKeys.all }),
  });
}

export function useUpdateRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecipeInput }) => updateRecipe(id, input),
    onSuccess: (_result, { id }) => Promise.all([
      client.invalidateQueries({ queryKey: recipeKeys.all }),
      client.invalidateQueries({ queryKey: recipeKeys.detail(id) }),
    ]),
  });
}

export function useDeleteRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, imagePath }: { id: string; imagePath: string | null }) => deleteRecipe(id, imagePath),
    onSuccess: () => client.invalidateQueries({ queryKey: recipeKeys.all }),
  });
}

export function useLogRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ recipeId, date, mealType, servings }: {
      recipeId: string;
      date: string;
      mealType: Parameters<typeof logRecipe>[2];
      servings: number;
    }) => logRecipe(recipeId, date, mealType, servings),
    // A logged recipe becomes ordinary food data, so every nutrition surface changes.
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['nutrition'] }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}
