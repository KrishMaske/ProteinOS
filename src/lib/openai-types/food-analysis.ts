import { z } from 'zod';

const nonnegative = z.number().min(0);
export const FoodEstimateSchema = z.object({
  name: z.string().min(1), estimatedQuantity: nonnegative.nullable(), unit: z.string().nullable(), estimatedGrams: nonnegative.nullable(),
  calories: nonnegative, proteinGrams: nonnegative, carbohydrateGrams: nonnegative, fatGrams: nonnegative, fiberGrams: nonnegative.nullable(),
  confidence: z.number().min(0).max(1), reasoningSummary: z.string(),
});
export const FoodTotalsSchema = z.object({ calories: nonnegative, proteinGrams: nonnegative, carbohydrateGrams: nonnegative, fatGrams: nonnegative, fiberGrams: nonnegative.nullable() });
export const FoodAnalysisSchema = z.object({ mealName: z.string(), foods: z.array(FoodEstimateSchema), totals: FoodTotalsSchema, overallConfidence: z.number().min(0).max(1), assumptions: z.array(z.string()), warnings: z.array(z.string()) });
export type FoodAnalysis = z.infer<typeof FoodAnalysisSchema>;
