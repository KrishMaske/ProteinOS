import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addWorkoutSet, completeRestDay, completeWorkout, discardWorkout, getWorkout, getWorkoutHistory, logActiveWorkoutSet, removeWorkoutSet, replaceWorkoutExercise, startWorkout, updateWorkoutExerciseNotes, updateWorkoutSet , skipWorkoutSet, skipWorkoutExercise, skipRoutineDay } from '@/features/workouts/api/workouts';
export const workoutKeys = { all: ['workouts'] as const, detail: (id: string) => ['workouts', id] as const };
export function useWorkout(id: string) { return useQuery({ queryKey: workoutKeys.detail(id), queryFn: () => getWorkout(id), enabled: Boolean(id), refetchInterval: false }); }
export function useStartWorkout() { const client = useQueryClient(); return useMutation({ mutationFn: ({ dayId }: { dayId: string }) => startWorkout(dayId), onSuccess: (session) => Promise.all([client.invalidateQueries({ queryKey: ['today'] }), client.invalidateQueries({ queryKey: workoutKeys.detail(session.id) })]) }); }
export function useQuickLogSet(workoutId: string) { const client = useQueryClient(); return useMutation({ mutationFn: ({ setId, weightKg, reps }: { setId: string; weightKg: number | null; reps: number }) => logActiveWorkoutSet(setId, weightKg, reps), onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['today'] }), client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }), client.invalidateQueries({ queryKey: ['progress'] })]) }); }
export function useCompleteRestDay() { const client = useQueryClient(); return useMutation({ mutationFn: completeRestDay, onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['today'] }), client.invalidateQueries({ queryKey: ['routines'] })]) }); }
export function useUpdateSet(workoutId: string) { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, values }: { id: string; values: Parameters<typeof updateWorkoutSet>[1] }) => updateWorkoutSet(id, values), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }), client.invalidateQueries({ queryKey: ['today'] })]) }); }
export function useAddSet(workoutId: string) { const client = useQueryClient(); return useMutation({ mutationFn: ({ exerciseId, nextIndex }: { exerciseId: string; nextIndex: number }) => addWorkoutSet(exerciseId, nextIndex), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }), client.invalidateQueries({ queryKey: ['today'] })]) }); }
export function useRemoveSet(workoutId: string) { const client = useQueryClient(); return useMutation({ mutationFn: removeWorkoutSet, onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }), client.invalidateQueries({ queryKey: ['today'] })]) }); }
export function useCompleteWorkout() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id }: { id: string }) => completeWorkout(id), onSettled: (_, __, { id }) => Promise.all([client.invalidateQueries({ queryKey: workoutKeys.detail(id) }), client.invalidateQueries({ queryKey: ['workouts', 'history'] }), client.invalidateQueries({ queryKey: ['today'] }), client.invalidateQueries({ queryKey: ['progress'] })]) }); }
export function useDiscardWorkout() { const client = useQueryClient(); return useMutation({ mutationFn: discardWorkout, onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: workoutKeys.all }), client.invalidateQueries({ queryKey: ['today'] })]) }); }
export function useWorkoutHistory() { return useQuery({ queryKey: ['workouts', 'history'], queryFn: getWorkoutHistory }); }
export function useUpdateWorkoutExercise(workoutId: string) { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, notes }: { id: string; notes: string | null }) => updateWorkoutExerciseNotes(id, notes), onSuccess: () => client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }) }); }
export function useReplaceWorkoutExercise(workoutId: string) { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, exerciseKey }: { id: string; exerciseKey: string }) => replaceWorkoutExercise(id, exerciseKey), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }), client.invalidateQueries({ queryKey: ['today'] })]) }); }

export function useSkipSet(workoutId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, skipped }: { id: string; skipped: boolean }) => skipWorkoutSet(id, skipped),
    onSuccess: () => client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }),
  });
}

export function useSkipExercise(workoutId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: skipWorkoutExercise,
    onSuccess: () => client.invalidateQueries({ queryKey: workoutKeys.detail(workoutId) }),
  });
}

export function useSkipRoutineDay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: skipRoutineDay,
    // The rotation moved, so Today and the routine both show a different day now.
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['today'] }),
      client.invalidateQueries({ queryKey: ['routines'] }),
    ]),
  });
}
