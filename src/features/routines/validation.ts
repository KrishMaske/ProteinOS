import { z } from 'zod';

export const routineExerciseInputSchema = z.object({
  exerciseId: z.string().min(1),
  targetSets: z.number().int().min(1).max(20),
  repMin: z.number().int().min(1).max(100).nullable(),
  repMax: z.number().int().min(1).max(100).nullable(),
  restSeconds: z.number().int().min(0).max(3600),
  targetRpe: z.number().min(1).max(10).nullable(),
  targetRir: z.number().min(0).max(10).nullable(),
  notes: z.string().max(1000).nullable(),
}).refine((value) => value.repMin === null || value.repMax === null || value.repMax >= value.repMin, {
  message: 'Maximum reps must be greater than or equal to minimum reps',
  path: ['repMax'],
});

export const routineDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  days: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    isRestDay: z.boolean(),
    exercises: z.array(routineExerciseInputSchema).max(30),
  }).superRefine((day, context) => {
    if (day.isRestDay && day.exercises.length) context.addIssue({ code: 'custom', path: ['exercises'], message: 'Rest days cannot contain exercises' });
    if (!day.isRestDay && !day.exercises.length) context.addIssue({ code: 'custom', path: ['exercises'], message: 'Training days need an exercise' });
  })).min(1).max(21),
}).refine((routine) => routine.days.some((day) => !day.isRestDay), { path: ['days'], message: 'A routine needs a training day' });
