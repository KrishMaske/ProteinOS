export type RecipeMacros = {
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  fiberGrams: number;
};

type MacroBearing = {
  calories?: number | string | null;
  protein_grams?: number | string | null;
  carbohydrate_grams?: number | string | null;
  fat_grams?: number | string | null;
  fiber_grams?: number | string | null;
};

/**
 * Totals are summed from ingredients rather than stored, so a recipe can never disagree
 * with its own contents. Kept free of Expo imports so it stays unit-testable.
 */
export function recipeTotals(ingredients: MacroBearing[]): RecipeMacros {
  return ingredients.reduce<RecipeMacros>((sum, item) => ({
    calories: sum.calories + Number(item.calories ?? 0),
    proteinGrams: sum.proteinGrams + Number(item.protein_grams ?? 0),
    carbohydrateGrams: sum.carbohydrateGrams + Number(item.carbohydrate_grams ?? 0),
    fatGrams: sum.fatGrams + Number(item.fat_grams ?? 0),
    fiberGrams: sum.fiberGrams + Number(item.fiber_grams ?? 0),
  }), { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0, fiberGrams: 0 });
}

/** A non-positive yield would divide by zero, so it falls back to treating the recipe as one serving. */
export function perServing(totals: RecipeMacros, servings: number): RecipeMacros {
  const divisor = servings > 0 ? servings : 1;
  return {
    calories: totals.calories / divisor,
    proteinGrams: totals.proteinGrams / divisor,
    carbohydrateGrams: totals.carbohydrateGrams / divisor,
    fatGrams: totals.fatGrams / divisor,
    fiberGrams: totals.fiberGrams / divisor,
  };
}

/** Scale used when logging: the share of the whole recipe actually eaten. */
export function servingScale(servingsEaten: number, recipeYield: number) {
  if (!(servingsEaten > 0) || !(recipeYield > 0)) return 0;
  return servingsEaten / recipeYield;
}
