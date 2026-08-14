import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSettings, recalculateNutritionTargets, setFitnessGoal, updateBodyMeasurements, updateSettings } from '@/features/settings/api/settings';

export const settingsKey = ['settings'] as const;
export function useSettings() { return useQuery({ queryKey: settingsKey, queryFn: getSettings }); }
export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({ mutationFn: updateSettings, onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: settingsKey }), client.invalidateQueries({ queryKey: ['progress'] }), client.invalidateQueries({ queryKey: ['today'] })]) });
}
export function useUpdateBodyMeasurements() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateBodyMeasurements,
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: settingsKey }),
      client.invalidateQueries({ queryKey: ['progress'] }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}
export function useRecalculateNutritionTargets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: recalculateNutritionTargets,
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: settingsKey }),
      client.invalidateQueries({ queryKey: ['nutrition'] }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}
export function useUpdateFitnessGoal() {
  const client = useQueryClient();
  return useMutation({ mutationFn: setFitnessGoal, onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: settingsKey }), client.invalidateQueries({ queryKey: ['today'] }), client.invalidateQueries({ queryKey: ['coach'] })]) });
}
