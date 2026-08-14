export type Macros = { calories: number; proteinGrams: number; carbohydrateGrams: number; fatGrams: number; fiberGrams: number };
export function aggregateMacros(items: Partial<Macros>[]): Macros {
  return items.reduce<Macros>((sum, item) => ({ calories: sum.calories + (item.calories ?? 0), proteinGrams: sum.proteinGrams + (item.proteinGrams ?? 0), carbohydrateGrams: sum.carbohydrateGrams + (item.carbohydrateGrams ?? 0), fatGrams: sum.fatGrams + (item.fatGrams ?? 0), fiberGrams: sum.fiberGrams + (item.fiberGrams ?? 0) }), { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0, fiberGrams: 0 });
}
