import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBodyMetric, deleteBodyMetric, getProgressDashboard, pickAndSaveProgressPhoto, updateBodyMetric } from '@/features/progress/api/progress';
import type { EditableBodyMetric } from '@/features/progress/services/body-metric-form';
import type { TablesInsert } from '@/types/database';

export const progressKeys = { dashboard: ['progress', 'dashboard'] as const };
export function useProgressDashboard() { return useQuery({ queryKey: progressKeys.dashboard, queryFn: getProgressDashboard }); }
export function useCreateBodyMetric() { const client = useQueryClient(); return useMutation({ mutationFn: (input: TablesInsert<'body_metrics'>) => createBodyMetric(input), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: progressKeys.dashboard }), client.invalidateQueries({ queryKey: ['today'] })]) }); }
export function useUpdateBodyMetric() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, userId, input }: { id: string; userId: string; input: EditableBodyMetric }) => updateBodyMetric(id, userId, input), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: progressKeys.dashboard }), client.invalidateQueries({ queryKey: ['today'] })]) }); }
export function useDeleteBodyMetric() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, userId }: { id: string; userId: string }) => deleteBodyMetric(id, userId), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: progressKeys.dashboard }), client.invalidateQueries({ queryKey: ['today'] }), client.invalidateQueries({ queryKey: ['settings'] })]) }); }
export function useAddProgressPhoto() { const client = useQueryClient(); return useMutation({ mutationFn: pickAndSaveProgressPhoto, onSuccess: () => client.invalidateQueries({ queryKey: progressKeys.dashboard }) }); }
