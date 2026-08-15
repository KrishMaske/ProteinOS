import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFoodLog, createSavedFood, deleteFoodLog, setFoodLogItemQuantity, deleteSavedFood, getDailyNutrition, getFoodLog, getSavedFood, getSavedFoods, logSavedFood, updateFoodItem, updateFoodLog, updateSavedFood } from '@/features/nutrition/api/nutrition';
import type { Database, TablesInsert, TablesUpdate } from '@/types/database';

type CreateFoodLogInput = {
  userId: string;
  log: TablesInsert<'food_logs'>;
  items: TablesInsert<'food_log_items'>[];
};
export const nutritionKeys = { day: (date: string) => ['nutrition', date] as const };
export const savedFoodKeys = {
  all: ['nutrition', 'saved-foods'] as const,
  detail: (id: string) => ['nutrition', 'saved-foods', id] as const,
};
export function useDailyNutrition(date: string) { return useQuery({ queryKey: nutritionKeys.day(date), queryFn: () => getDailyNutrition(date) }); }
export function useCreateFoodLog(date: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, log, items }: CreateFoodLogInput) => createFoodLog(userId, log, items),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: nutritionKeys.day(date) }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}
export function useFoodLog(id: string) { return useQuery({ queryKey: ['nutrition', 'log', id], queryFn: () => getFoodLog(id), enabled: Boolean(id) }); }
export function useUpdateFoodLog(id: string) { const client = useQueryClient(); return useMutation({ mutationFn: (input: { log: Parameters<typeof updateFoodLog>[1]; items: { id: string; values: Parameters<typeof updateFoodItem>[1] }[] }) => Promise.all([updateFoodLog(id, input.log), ...input.items.map((item) => updateFoodItem(item.id, item.values))]), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ['nutrition'] }), client.invalidateQueries({ queryKey: ['today'] })]) }); }
export function useDeleteFoodLog() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, photoPath }: { id: string; photoPath: string | null }) => deleteFoodLog(id, photoPath), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ['nutrition'] }), client.invalidateQueries({ queryKey: ['today'] })]) }); }

export function useSavedFoods() {
  return useQuery({ queryKey: savedFoodKeys.all, queryFn: getSavedFoods });
}

export function useSavedFood(id: string) {
  return useQuery({ queryKey: savedFoodKeys.detail(id), queryFn: () => getSavedFood(id), enabled: Boolean(id) && id !== 'new' });
}

export function useCreateSavedFood() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (values: TablesInsert<'saved_foods'>) => createSavedFood(values), onSuccess: () => client.invalidateQueries({ queryKey: savedFoodKeys.all }) });
}

export function useUpdateSavedFood(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: TablesUpdate<'saved_foods'>) => updateSavedFood(id, values),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: savedFoodKeys.all }),
      client.invalidateQueries({ queryKey: savedFoodKeys.detail(id) }),
    ]),
  });
}

export function useDeleteSavedFood() {
  const client = useQueryClient();
  return useMutation({ mutationFn: deleteSavedFood, onSuccess: () => client.invalidateQueries({ queryKey: savedFoodKeys.all }) });
}

export function useLogSavedFood(date: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mealType }: { id: string; mealType: Database['public']['Enums']['meal_type'] }) => logSavedFood(id, date, mealType),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: savedFoodKeys.all }),
      client.invalidateQueries({ queryKey: nutritionKeys.day(date) }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}

export function useSetFoodLogItemQuantity() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) => setFoodLogItemQuantity(itemId, quantity),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['nutrition'] }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}
