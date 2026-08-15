import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createGym,
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
