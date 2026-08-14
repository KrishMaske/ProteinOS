import { z } from 'zod';

export const onboardingSchema = z.object({
  displayName: z.string().trim().min(1, 'Tell us what to call you').max(80),
  age: z.number().int().min(13).max(120),
  height: z.number().positive().max(300),
  weight: z.number().positive().max(700),
  preferredUnits: z.enum(['metric', 'imperial']),
  biologicalSex: z.enum(['male', 'female', 'unspecified']),
  goalType: z.enum(['recomp', 'fat_loss', 'muscle_gain', 'maintenance', 'strength']),
  trainingExperience: z.enum(['beginner', 'intermediate', 'advanced']),
  trainingDaysPerWeek: z.number().int().min(1).max(7),
  preferredSessionMinutes: z.number().int().min(15).max(240),
  equipment: z.string(),
  exercisesToAvoid: z.string(),
  dietPreference: z.string().optional(),
  calorieTarget: z.number().int().min(800).max(10000).optional().or(z.literal('')),
  proteinTarget: z.number().min(0).max(1000).optional().or(z.literal('')),
  carbohydrateTarget: z.number().min(0).max(2000).optional().or(z.literal('')),
  fatTarget: z.number().min(0).max(1000).optional().or(z.literal('')),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;
