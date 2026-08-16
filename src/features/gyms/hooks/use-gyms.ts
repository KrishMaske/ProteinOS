import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createGym,
  getGymSubstitutions,
  removeGymSubstitution,
  setGymSubstitution,
  deleteGym,
  getGymComparison,
  getGyms,
  setDefaultGym,
  setSessionGym,
  updateGym,
} from '@/features/gyms/api/gyms';

export const gymKeys = {
  all: ['gyms'] as const,
  comparison: (exerciseKey?: string) => ['gyms', 'comparison', exerciseKey ?? 'all'] as const,
};

export function useGyms() {
  return useQuery({ queryKey: gymKeys.all, queryFn: getGyms });
}

export function useGymComparison(exerciseKey?: string) {
  return useQuery({
    queryKey: gymKeys.comparison(exerciseKey),
    queryFn: () => getGymComparison(exerciseKey),
  });
}

export function useCreateGym() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...values }: { userId: string; name: string; notes: string | null; is_default?: boolean }) =>
      createGym(userId, values),
    onSuccess: () => client.invalidateQueries({ queryKey: gymKeys.all }),
  });
}

export function useUpdateGym() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...values }: { id: string; name: string; notes: string | null }) => updateGym(id, values),
    onSuccess: () => client.invalidateQueries({ queryKey: gymKeys.all }),
  });
}

export function useSetDefaultGym() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setDefaultGym,
    onSuccess: () => client.invalidateQueries({ queryKey: gymKeys.all }),
  });
}

export function useDeleteGym() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteGym,
    // Sessions lose their gym reference, so anything grouped by gym changes too.
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: gymKeys.all }),
      client.invalidateQueries({ queryKey: ['workouts'] }),
    ]),
  });
}

export function useSetSessionGym(workoutId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, gymId }: { sessionId: string; gymId: string | null }) => setSessionGym(sessionId, gymId),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['workouts', workoutId] }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}

export function useGymSubstitutions(gymId: string | null) {
  return useQuery({
    queryKey: ['gyms', 'substitutions', gymId ?? 'none'],
    queryFn: () => getGymSubstitutions(gymId!),
    enabled: Boolean(gymId),
  });
}

export function useSetGymSubstitution() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, gymId, from, toExerciseKey }: {
      userId: string;
      gymId: string;
      from: { exercise_id: string | null; custom_exercise_id: string | null };
      toExerciseKey: string;
    }) => setGymSubstitution(userId, gymId, from, toExerciseKey),
    onSuccess: () => client.invalidateQueries({ queryKey: ['gyms', 'substitutions'] }),
  });
}

export function useRemoveGymSubstitution() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: removeGymSubstitution,
    onSuccess: () => client.invalidateQueries({ queryKey: ['gyms', 'substitutions'] }),
  });
}
