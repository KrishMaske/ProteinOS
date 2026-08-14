import type { RoutineImportReviewSelection } from '@/lib/openai-types/routine-import';

export function reviewedKeysAfterSelectionChange(
  reviewedExerciseKeys: string[],
  exerciseKey: string,
  previousSelection: RoutineImportReviewSelection | undefined,
  nextSelection: RoutineImportReviewSelection,
) {
  if (sameReviewSelection(previousSelection, nextSelection)) return reviewedExerciseKeys;
  return reviewedExerciseKeys.filter((reviewedKey) => reviewedKey !== exerciseKey);
}

export function shouldStackRoutineImportFooter(width: number, fontScale: number) {
  return width < 430 || fontScale >= 1.2;
}

function sameReviewSelection(
  first: RoutineImportReviewSelection | undefined,
  second: RoutineImportReviewSelection,
) {
  if (!first || first.type !== second.type) return false;
  if (first.type === 'catalog' && second.type === 'catalog') return first.exerciseId === second.exerciseId;
  if (first.type === 'custom' && second.type === 'custom') {
    return first.customName === second.customName && first.useStagedImage === second.useStagedImage;
  }
  return false;
}
