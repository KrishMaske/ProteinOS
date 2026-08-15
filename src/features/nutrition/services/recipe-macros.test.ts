import { describe, expect, it } from 'vitest';

import { perServing, recipeTotals, servingScale } from './recipe-macros';

const chickenAndRice = [
  { calories: 330, protein_grams: 62, carbohydrate_grams: 0, fat_grams: 7, fiber_grams: 0 },
  { calories: 520, protein_grams: 10, carbohydrate_grams: 112, fat_grams: 2, fiber_grams: 4 },
  { calories: 120, protein_grams: 0, carbohydrate_grams: 0, fat_grams: 14, fiber_grams: 0 },
];

describe('recipeTotals', () => {
  it('sums every macro across ingredients', () => {
    expect(recipeTotals(chickenAndRice)).toEqual({
      calories: 970,
      proteinGrams: 72,
      carbohydrateGrams: 112,
      fatGrams: 23,
      fiberGrams: 4,
    });
  });

  it('treats missing macros as zero rather than NaN', () => {
    expect(recipeTotals([{ calories: 100 }])).toEqual({
      calories: 100, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0, fiberGrams: 0,
    });
  });

  it('accepts the numeric strings PostgREST returns', () => {
    expect(recipeTotals([{ calories: '250.50', protein_grams: '20' }]).calories).toBe(250.5);
    expect(recipeTotals([{ calories: '250.50', protein_grams: '20' }]).proteinGrams).toBe(20);
  });

  it('is zero for an empty recipe', () => {
    expect(recipeTotals([]).calories).toBe(0);
  });
});

describe('perServing', () => {
  it('divides the whole recipe by its yield', () => {
    const each = perServing(recipeTotals(chickenAndRice), 4);
    expect(each.calories).toBe(242.5);
    expect(each.proteinGrams).toBe(18);
  });

  it('never divides by zero or a negative yield', () => {
    const totals = recipeTotals(chickenAndRice);
    expect(perServing(totals, 0).calories).toBe(970);
    expect(perServing(totals, -2).calories).toBe(970);
  });

  it('round-trips: per serving times yield is the whole recipe', () => {
    const totals = recipeTotals(chickenAndRice);
    expect(perServing(totals, 3).calories * 3).toBeCloseTo(totals.calories, 6);
  });
});

describe('servingScale', () => {
  it('is the share of the recipe eaten', () => {
    expect(servingScale(1, 4)).toBe(0.25);
    expect(servingScale(4, 4)).toBe(1);
    expect(servingScale(2, 1)).toBe(2);
  });

  it('refuses nonsensical input rather than producing Infinity', () => {
    expect(servingScale(1, 0)).toBe(0);
    expect(servingScale(0, 4)).toBe(0);
    expect(servingScale(-1, 4)).toBe(0);
  });
});
