import { z } from 'zod';

const imageCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

const candidateSchema = z.object({
  exerciseId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  score: z.number().min(0).max(1),
  matchReason: z.string().trim().min(1).max(500),
  imageSource: z.string().url().nullable().optional(),
  gifSource: z.string().url().nullable().optional(),
});

const catalogResolutionSchema = z.object({
  type: z.literal('catalog'),
  exerciseId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(500),
});

const customResolutionSchema = z.object({
  type: z.literal('custom'),
  name: z.string().trim().min(1).max(200),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(500),
});

const importExerciseSchema = z.object({
  exerciseKey: z.string().min(1),
  sourceTitle: z.string().trim().min(1).max(200),
  sourceDetails: z.string().trim().max(2_000).nullable(),
  pageNumber: z.number().int().positive().nullable(),
  imageCrop: imageCropSchema.nullable(),
  stagedImagePath: z.string().min(1).nullable(),
  candidates: z.array(candidateSchema).max(8),
  suggestedResolution: z.discriminatedUnion('type', [catalogResolutionSchema, customResolutionSchema]),
});

const importDaySchema = z.object({
  dayKey: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2_000).nullable(),
  isRestDay: z.boolean(),
  exercises: z.array(importExerciseSchema).max(50),
});

export const RoutineImportAnalysisSchema = z.object({
  importId: z.string().uuid(),
  status: z.literal('review'),
  sourceFileName: z.string().trim().min(1).max(255),
  routineName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable(),
  expiresAt: z.string().datetime(),
  cycleLength: z.number().int().positive(),
  trainingDays: z.number().int().nonnegative(),
  restDays: z.number().int().nonnegative(),
  days: z.array(importDaySchema).min(1).max(21),
  warnings: z.array(z.string().trim().min(1).max(500)).max(30),
});

export const RoutineImportReviewSelectionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('catalog'),
    exerciseId: z.string().min(1),
  }),
  z.object({
    type: z.literal('custom'),
    customName: z.string().max(200),
    useStagedImage: z.boolean(),
  }),
]);

export const StoredRoutineImportReviewSchema = z.object({
  version: z.literal(2),
  analysis: RoutineImportAnalysisSchema,
  selections: z.record(z.string(), RoutineImportReviewSelectionSchema),
  reviewedExerciseKeys: z.array(z.string().min(1)),
  activeExerciseKey: z.string().min(1).nullable(),
});

export const RoutineImportChoiceSchema = z.discriminatedUnion('type', [
  z.object({
    exerciseKey: z.string().min(1),
    type: z.literal('catalog'),
    exerciseId: z.string().min(1),
    customName: z.null(),
    useStagedImage: z.literal(false),
  }),
  z.object({
    exerciseKey: z.string().min(1),
    type: z.literal('custom'),
    exerciseId: z.null(),
    customName: z.string().trim().min(1).max(200),
    useStagedImage: z.boolean(),
  }),
]);

export const RoutineImportConfirmationSchema = z.object({
  routineId: z.string().uuid(),
  routineName: z.string().trim().min(1),
});

export type RoutineImportAnalysis = z.infer<typeof RoutineImportAnalysisSchema>;
export type RoutineImportCandidate = z.infer<typeof candidateSchema>;
export type RoutineImportChoice = z.infer<typeof RoutineImportChoiceSchema>;
export type RoutineImportConfirmation = z.infer<typeof RoutineImportConfirmationSchema>;
export type RoutineImportExercise = z.infer<typeof importExerciseSchema>;
export type RoutineImportReviewSelection = z.infer<typeof RoutineImportReviewSelectionSchema>;
export type StoredRoutineImportReview = z.infer<typeof StoredRoutineImportReviewSchema>;
