import { useQuery } from '@tanstack/react-query';

import { getExercise, getExerciseFilterOptions, getExerciseHistory, searchExercises, type ExerciseFilters } from '@/features/exercises/api/search-exercises';

const exerciseRootKey = ['exercises'] as const;
export const exerciseKeys = {
  all: exerciseRootKey,
  list: (filters: ExerciseFilters) => [...exerciseRootKey, 'list', filters] as const,
  detail: (id: string) => [...exerciseRootKey, 'detail', id] as const,
  history: (id: string) => [...exerciseRootKey, 'history', id] as const,
  filters: [...exerciseRootKey, 'filters'] as const,
};

export function useExercises(filters: ExerciseFilters) { return useQuery({ queryKey: exerciseKeys.list(filters), queryFn: () => searchExercises(filters) }); }
export function useExercise(id: string) { return useQuery({ queryKey: exerciseKeys.detail(id), queryFn: () => getExercise(id), enabled: Boolean(id) }); }
export function useExerciseHistory(id: string) { return useQuery({ queryKey: exerciseKeys.history(id), queryFn: () => getExerciseHistory(id), enabled: Boolean(id) }); }
export function useExerciseFilters() { return useQuery({ queryKey: exerciseKeys.filters, queryFn: getExerciseFilterOptions, staleTime: 60 * 60 * 1000 }); }
