import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelRoutineImport, confirmRoutineImport, createStagedImageUrl, getCatalogCandidateMedia, pickAndAnalyzeRoutine } from '@/features/routines/api/routine-import';
import type { RoutineImportCandidate, RoutineImportChoice } from '@/lib/openai-types/routine-import';

export function useAnalyzeRoutineImport() {
  return useMutation({ mutationFn: pickAndAnalyzeRoutine });
}

export function useConfirmRoutineImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ importId, resolutions }: { importId: string; resolutions: RoutineImportChoice[] }) => confirmRoutineImport(importId, resolutions),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['routines'] }),
      client.invalidateQueries({ queryKey: ['today'] }),
    ]),
  });
}

export function useCancelRoutineImport() {
  return useMutation({ mutationFn: cancelRoutineImport });
}

export function useCandidateMedia(exerciseKey: string, candidates: RoutineImportCandidate[]) {
  return useQuery({
    queryKey: ['routine-import', 'candidate-media', exerciseKey, candidates.map((candidate) => candidate.exerciseId)],
    queryFn: () => getCatalogCandidateMedia(candidates),
    initialData: candidates.every((candidate) => candidate.imageSource || candidate.gifSource) ? candidates : undefined,
    staleTime: 60 * 60 * 1000,
  });
}

export function useStagedImage(path: string | null) {
  return useQuery({
    queryKey: ['routine-import', 'staged-image', path],
    queryFn: () => createStagedImageUrl(path!),
    enabled: Boolean(path),
    staleTime: 10 * 60 * 1000,
  });
}
