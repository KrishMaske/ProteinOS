import {
  type CatalogExercise,
  type RankedExerciseCandidate,
  normalizeExerciseName,
  rankExerciseCandidates,
} from './matching.ts';

export type NormalizedImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedCustomExercise = {
  category: string | null;
  bodyPart: string | null;
  equipment: string | null;
  target: string | null;
  muscleGroup: string | null;
  secondaryMuscles: string[];
  instructions: string | null;
  instructionSteps: string[];
};

export type ExtractedExercise = {
  exerciseKey: string;
  sourceTitle: string;
  sourceDetails: string | null;
  pageNumber: number | null;
  imageCrop: NormalizedImageCrop | null;
  customExercise: ExtractedCustomExercise;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number;
  targetRpe: number | null;
  targetRir: number | null;
  notes: string | null;
};

export type ExtractedDay = {
  dayKey: string;
  name: string;
  notes: string | null;
  isRestDay: boolean;
  exercises: ExtractedExercise[];
};

export type WorkoutExtraction = {
  routineName: string;
  description: string | null;
  days: ExtractedDay[];
  warnings: string[];
};

export type SemanticSelection = {
  exerciseKey: string;
  suggestedExerciseId: string | null;
  confidence: number;
  reason: string;
};

export type ReviewCandidate = {
  exerciseId: string;
  name: string;
  score: number;
  matchReason: string;
};

export type CatalogSuggestion = {
  type: 'catalog';
  exerciseId: string;
  confidence: number;
  reason: string;
};

export type CustomSuggestion = {
  type: 'custom';
  name: string;
  confidence: number;
  reason: string;
};

export type SuggestedResolution = CatalogSuggestion | CustomSuggestion;

export type ExerciseReview = {
  exerciseKey: string;
  sourceTitle: string;
  sourceDetails: string | null;
  pageNumber: number | null;
  imageCrop: NormalizedImageCrop | null;
  stagedImagePath: string | null;
  candidates: ReviewCandidate[];
  suggestedResolution: SuggestedResolution;
  customExercise: ExtractedCustomExercise;
};

export type ReviewCandidateSet = {
  exercise: ExtractedExercise;
  candidates: RankedExerciseCandidate[];
};

const SEMANTIC_CANDIDATE_LIMIT = 8;
const CATALOG_SUGGESTION_THRESHOLD = 0.62;
export const MAX_UNIQUE_IMPORT_EXERCISES = 80;

function padded(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * Model-provided keys are deliberately replaced with position-derived keys.
 * This makes them stable, unique, path-safe, and independent of untrusted file
 * contents while preserving the exact ordered cycle.
 */
export function assignStableImportKeys(extraction: WorkoutExtraction): WorkoutExtraction {
  const keyByMovement = new Map<string, string>();
  let uniqueMovementIndex = 0;
  return {
    ...extraction,
    days: extraction.days.map((day, dayIndex) => {
      const dayKey = `slot-${padded(dayIndex + 1)}`;
      return {
        ...day,
        dayKey,
        exercises: day.exercises.map((exercise) => {
          const movementIdentity = [
            normalizeExerciseName(exercise.sourceTitle),
            normalizeExerciseName(exercise.sourceDetails ?? ''),
          ].join('|');
          let exerciseKey = keyByMovement.get(movementIdentity);
          if (!exerciseKey) {
            uniqueMovementIndex += 1;
            exerciseKey = `exercise-${String(uniqueMovementIndex).padStart(3, '0')}`;
            keyByMovement.set(movementIdentity, exerciseKey);
          }
          return { ...exercise, exerciseKey };
        }),
      };
    }),
  };
}

export function createCandidateSets(
  extraction: WorkoutExtraction,
  catalog: CatalogExercise[],
): ReviewCandidateSet[] {
  const firstByKey = new Map<string, ExtractedExercise>();
  for (const day of extraction.days) {
    for (const exercise of day.exercises) {
      if (!firstByKey.has(exercise.exerciseKey)) firstByKey.set(exercise.exerciseKey, exercise);
      if (firstByKey.size > MAX_UNIQUE_IMPORT_EXERCISES) {
        throw new Error(
          `A workout file can contain at most ${MAX_UNIQUE_IMPORT_EXERCISES} unique exercises.`,
        );
      }
    }
  }
  return [...firstByKey.values()].map((exercise) => ({
      exercise,
      candidates: rankExerciseCandidates(
        exercise.sourceTitle,
        exercise.sourceDetails,
        catalog,
        SEMANTIC_CANDIDATE_LIMIT,
      ),
    }));
}

export function uniqueExtractedExercises(extraction: WorkoutExtraction) {
  const firstByKey = new Map<string, ExtractedExercise>();
  for (const day of extraction.days) {
    for (const exercise of day.exercises) {
      if (!firstByKey.has(exercise.exerciseKey)) firstByKey.set(exercise.exerciseKey, exercise);
    }
  }
  return [...firstByKey.values()];
}

export function semanticSelectionInput(candidateSets: ReviewCandidateSet[]) {
  return candidateSets.map(({ exercise, candidates }) => ({
    exerciseKey: exercise.exerciseKey,
    sourceTitle: exercise.sourceTitle,
    sourceDetails: exercise.sourceDetails,
    candidates: candidates.map(({ exercise: candidate, score }) => ({
      exerciseId: candidate.id,
      name: candidate.name,
      category: candidate.category ?? null,
      bodyPart: candidate.body_part ?? null,
      equipment: candidate.equipment ?? null,
      target: candidate.target ?? null,
      muscleGroup: candidate.muscle_group ?? null,
      retrievalScore: score,
    })),
  }));
}

function roundedConfidence(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

/**
 * Enforces one semantic result per extracted exercise and rejects every model
 * ID that was not in that exercise's server-built catalog candidate allowlist.
 */
export function resolveSemanticSelections(
  candidateSets: ReviewCandidateSet[],
  selections: SemanticSelection[],
): ExerciseReview[] {
  const expectedKeys = new Set(candidateSets.map(({ exercise }) => exercise.exerciseKey));
  const byKey = new Map<string, SemanticSelection>();
  for (const selection of selections) {
    if (!expectedKeys.has(selection.exerciseKey)) {
      throw new Error(`Semantic selection returned an unknown exercise key: ${selection.exerciseKey}`);
    }
    if (byKey.has(selection.exerciseKey)) {
      throw new Error(`Semantic selection returned a duplicate exercise key: ${selection.exerciseKey}`);
    }
    byKey.set(selection.exerciseKey, selection);
  }
  if (byKey.size !== expectedKeys.size) throw new Error('Semantic selection omitted one or more exercises');

  return candidateSets.map(({ exercise, candidates }) => {
    const selection = byKey.get(exercise.exerciseKey)!;
    const allowedIds = new Set(candidates.map(({ exercise: candidate }) => candidate.id));
    if (selection.suggestedExerciseId !== null && !allowedIds.has(selection.suggestedExerciseId)) {
      throw new Error(`Semantic selection returned a catalog ID outside the allowlist for ${exercise.exerciseKey}`);
    }

    const confidence = roundedConfidence(selection.confidence);
    const useCatalog = selection.suggestedExerciseId !== null
      && confidence >= CATALOG_SUGGESTION_THRESHOLD;
    const suggestedResolution: SuggestedResolution = useCatalog
      ? {
        type: 'catalog',
        exerciseId: selection.suggestedExerciseId!,
        confidence,
        reason: selection.reason,
      }
      : {
        type: 'custom',
        name: exercise.sourceTitle,
        confidence: roundedConfidence(1 - confidence),
        reason: selection.suggestedExerciseId === null
          ? selection.reason
          : `No catalog candidate cleared the review threshold. ${selection.reason}`,
      };

    return {
      exerciseKey: exercise.exerciseKey,
      sourceTitle: exercise.sourceTitle,
      sourceDetails: exercise.sourceDetails,
      pageNumber: exercise.pageNumber,
      imageCrop: exercise.imageCrop,
      stagedImagePath: null,
      candidates: candidates.map((candidate) => ({
        exerciseId: candidate.exercise.id,
        name: candidate.exercise.name,
        score: candidate.score,
        matchReason: candidate.matchReason,
      })),
      suggestedResolution,
      customExercise: exercise.customExercise,
    };
  });
}

export function catalogReviewForExactMatch(
  candidateSet: ReviewCandidateSet,
  exerciseId: string,
): ExerciseReview {
  const selected = candidateSet.candidates.find(({ exercise }) => exercise.id === exerciseId);
  if (!selected) throw new Error(`Exact match was absent from the safe candidate list for ${candidateSet.exercise.exerciseKey}`);
  const exercise = candidateSet.exercise;
  return {
    exerciseKey: exercise.exerciseKey,
    sourceTitle: exercise.sourceTitle,
    sourceDetails: exercise.sourceDetails,
    pageNumber: exercise.pageNumber,
    imageCrop: exercise.imageCrop,
    stagedImagePath: null,
    candidates: candidateSet.candidates.map((candidate) => ({
      exerciseId: candidate.exercise.id,
      name: candidate.exercise.name,
      score: candidate.score,
      matchReason: candidate.matchReason,
    })),
    suggestedResolution: {
      type: 'catalog',
      exerciseId,
      confidence: 1,
      reason: 'Exact normalized exercise title match.',
    },
    customExercise: exercise.customExercise,
  };
}

export function routineExtractionForPersistence(extraction: WorkoutExtraction) {
  return {
    routineName: extraction.routineName,
    description: extraction.description,
    days: extraction.days.map((day) => ({
      dayKey: day.dayKey,
      name: day.name,
      notes: day.notes,
      isRestDay: day.isRestDay,
      exercises: day.exercises.map((exercise) => ({
        exerciseKey: exercise.exerciseKey,
        targetSets: exercise.targetSets,
        repMin: exercise.repMin,
        repMax: exercise.repMax,
        restSeconds: exercise.restSeconds,
        targetRpe: exercise.targetRpe,
        targetRir: exercise.targetRir,
        notes: exercise.notes,
      })),
    })),
  };
}
