import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSettings, recalculateNutritionTargets, setFitnessGoal, updateBodyMeasurements, updateSettings } from '@/features/settings/api/settings';

export const settingsKey = ['settings'] as const;
export function useSettings() { return useQuery({ queryKey: settingsKey, queryFn: getSettings }); }

/** Every query whose contents are derived rather than stored. */
const derivedKeys = [settingsKey, ['progress'], ['today'], ['nutrition'], ['coach']] as const;

function refreshDerived(client: ReturnType<typeof useQueryClient>) {
  return Promise.all(derivedKeys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/**
 * Profile fields that feed the calorie and macro calculation. Changing any of them makes
 * the stored targets stale, so they are re-derived rather than left for the user to
 * notice. Theme and photo-retention settings are deliberately absent.
 */
const TARGET_INPUT_FIELDS = [
  'training_days_per_week',
  'biological_sex',
  'birth_date',
  'height_cm',
  'target_weight_kg',
  'goal_body_fat_min',
  'goal_body_fat_max',
] as const;

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: async (_result, values) => {
      if (Object.keys(values).some((key) => TARGET_INPUT_FIELDS.includes(key as never))) {
        // Best effort: a failed re-derivation must not make the settings write look failed.
        await recalculateNutritionTargets().catch(() => undefined);
      }
      await refreshDerived(client);
    },
  });
}
export function useUpdateBodyMeasurements() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: updateBodyMeasurements,
    // Height, weight, age and goal weight are all calculation inputs, so this always re-derives.
    onSuccess: async () => {
      await recalculateNutritionTargets().catch(() => undefined);
      await refreshDerived(client);
    },
  });
}
export function useRecalculateNutritionTargets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: recalculateNutritionTargets,
    onSuccess: () => refreshDerived(client),
  });
}
export function useUpdateFitnessGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setFitnessGoal,
    // The goal sets both the calorie adjustment and the protein target.
    onSuccess: async () => {
      await recalculateNutritionTargets().catch(() => undefined);
      await refreshDerived(client);
    },
  });
}
