import { describe, expect, it } from 'vitest';

import {
  lifestyleMultiplier,
  trainingCaloriesPerDay,
  ageFromBirthDate,
  basalMetabolicRate,
  calculateNutritionTargets,
  bodyFatAdjustmentScale,
  goalAdjustmentScale,
  maintenanceCalories,
  observedMaintenanceCalories,
  summarizeWeightTrend,
  type TargetInputs,
} from './nutrition-targets';

/** Daily readings walking from `from` to `to` over `days`, newest last. */
function readingsOver(days: number, from: number, to: number) {
  const start = new Date('2026-07-01T08:00:00Z').getTime();
  return Array.from({ length: days }, (_, index) => ({
    measuredAt: new Date(start + index * 24 * 60 * 60 * 1000).toISOString(),
    weightKg: from + ((to - from) * index) / (days - 1),
  }));
}

const reference: TargetInputs = {
  weightKg: 80,
  heightCm: 178,
  age: 30,
  biologicalSex: 'male',
  trainingDaysPerWeek: 4,
  sessionMinutes: 60,
  dailyActivityLevel: 'light',
  goalType: 'maintenance',
};

describe('basalMetabolicRate', () => {
  it('matches Mifflin-St Jeor for a male profile', () => {
    // 10*80 + 6.25*178 - 5*30 + 5
    expect(basalMetabolicRate(reference)).toBe(1767.5);
  });

  it('applies the female constant', () => {
    expect(basalMetabolicRate({ ...reference, biologicalSex: 'female' })).toBe(1601.5);
  });

  it('uses the midpoint when sex is unstated', () => {
    const neutral = basalMetabolicRate({ ...reference, biologicalSex: null });
    const male = basalMetabolicRate({ ...reference, biologicalSex: 'male' });
    const female = basalMetabolicRate({ ...reference, biologicalSex: 'female' });
    expect(neutral).toBe((male + female) / 2);
  });
});

describe('lifestyleMultiplier', () => {
  it('describes activity outside training, not gym frequency', () => {
    expect(lifestyleMultiplier('sedentary')).toBe(1.2);
    expect(lifestyleMultiplier('light')).toBe(1.375);
    expect(lifestyleMultiplier('moderate')).toBe(1.55);
    expect(lifestyleMultiplier('very_active')).toBe(1.725);
  });

  it('assumes light rather than a desk job when unset', () => {
    expect(lifestyleMultiplier(null)).toBe(lifestyleMultiplier('light'));
  });
});

describe('trainingCaloriesPerDay', () => {
  it('costs a session at 4 net METs and averages it over the week', () => {
    // 4 METs * 65.77 kg * 1 h = 263 kcal per session, six of them spread over seven days.
    expect(trainingCaloriesPerDay(65.77, 6, 60)).toBeCloseTo((4 * 65.77 * 6) / 7, 4);
  });

  it('scales with session length and frequency', () => {
    expect(trainingCaloriesPerDay(80, 6, 90)).toBeGreaterThan(trainingCaloriesPerDay(80, 6, 60));
    expect(trainingCaloriesPerDay(80, 6, 60)).toBeGreaterThan(trainingCaloriesPerDay(80, 3, 60));
  });

  it('is zero without training and safe on missing inputs', () => {
    expect(trainingCaloriesPerDay(80, 0, 60)).toBe(0);
    expect(trainingCaloriesPerDay(0, 6, 60)).toBe(0);
    expect(trainingCaloriesPerDay(80, null, null)).toBeGreaterThan(0);
  });

  it('stays far below the jump a multiplier step would imply', () => {
    // Moving 1.2 -> 1.725 on a 1674 BMR would add about 880 kcal a day; an hour of
    // lifting six times a week is worth roughly a quarter of that.
    expect(trainingCaloriesPerDay(65.77, 6, 60)).toBeLessThan(300);
  });
});

describe('calculateNutritionTargets', () => {
  it('adjusts calories away from maintenance per goal', () => {
    const maintenance = calculateNutritionTargets(reference).calories;
    const cut = calculateNutritionTargets({ ...reference, goalType: 'fat_loss' }).calories;
    const bulk = calculateNutritionTargets({ ...reference, goalType: 'muscle_gain' }).calories;
    expect(cut).toBe(Math.round(maintenanceCalories(reference) * 0.8));
    expect(bulk).toBe(Math.round(maintenanceCalories(reference) * 1.1));
    expect(cut).toBeLessThan(maintenance);
    expect(bulk).toBeGreaterThan(maintenance);
  });

  it('keeps macros consistent with the calorie target', () => {
    for (const goalType of ['fat_loss', 'recomp', 'maintenance', 'strength', 'muscle_gain'] as const) {
      const targets = calculateNutritionTargets({ ...reference, goalType });
      const fromMacros =
        targets.proteinGrams * 4 + targets.carbohydrateGrams * 4 + targets.fatGrams * 9;
      expect(Math.abs(fromMacros - targets.calories)).toBeLessThanOrEqual(5);
    }
  });

  it('raises protein for goals that run a deficit', () => {
    const cut = calculateNutritionTargets({ ...reference, goalType: 'fat_loss' });
    const maintain = calculateNutritionTargets({ ...reference, goalType: 'maintenance' });
    expect(cut.proteinGrams).toBe(Math.round(reference.weightKg * 2.2));
    expect(cut.proteinGrams).toBeGreaterThan(maintain.proteinGrams);
  });

  it('separates people the old flat default treated identically', () => {
    const smallCutter = calculateNutritionTargets({
      weightKg: 55,
      heightCm: 160,
      age: 45,
      biologicalSex: 'female',
      trainingDaysPerWeek: 2,
      goalType: 'fat_loss',
    });
    const largeBulker = calculateNutritionTargets({
      weightKg: 95,
      heightCm: 190,
      age: 22,
      biologicalSex: 'male',
      trainingDaysPerWeek: 6,
      goalType: 'muscle_gain',
    });
    // The point is the spread, not either bound: the flat 2000 default gave both the
    // same number, and these two should be more than a thousand calories apart.
    expect(largeBulker.calories - smallCutter.calories).toBeGreaterThan(1500);
    expect(smallCutter.calories).toBeLessThan(2000);
    expect(largeBulker.calories).toBeGreaterThan(3000);
  });

  it('never prescribes a deficit below resting expenditure', () => {
    const targets = calculateNutritionTargets({
      weightKg: 48,
      heightCm: 152,
      age: 65,
      biologicalSex: 'female',
      trainingDaysPerWeek: 0,
      goalType: 'fat_loss',
    });
    expect(targets.calories).toBeGreaterThanOrEqual(targets.basalMetabolicRate);
    expect(targets.calories).toBeGreaterThanOrEqual(1200);
  });

  it('holds the essential fat floor on an aggressive cut', () => {
    const targets = calculateNutritionTargets({
      weightKg: 150,
      heightCm: 175,
      age: 30,
      biologicalSex: 'male',
      trainingDaysPerWeek: 3,
      goalType: 'fat_loss',
    });
    expect(targets.fatGrams).toBeGreaterThanOrEqual(Math.round(150 * 0.6));
    expect(targets.carbohydrateGrams).toBeGreaterThan(0);
  });

  it('caps protein share so heavy cutters keep a workable split', () => {
    const targets = calculateNutritionTargets({
      weightKg: 180,
      heightCm: 170,
      age: 50,
      biologicalSex: 'female',
      trainingDaysPerWeek: 2,
      goalType: 'fat_loss',
    });
    expect(targets.proteinGrams * 4).toBeLessThanOrEqual(targets.calories * 0.4 + 4);
    expect(targets.carbohydrateGrams).toBeGreaterThanOrEqual(0);
  });

  it('scales fiber with intake inside sane bounds', () => {
    expect(calculateNutritionTargets(reference).fiberGrams).toBe(
      Math.round((calculateNutritionTargets(reference).calories / 1000) * 14),
    );
    const tiny = calculateNutritionTargets({
      weightKg: 45,
      heightCm: 150,
      age: 70,
      biologicalSex: 'female',
      trainingDaysPerWeek: 0,
      goalType: 'fat_loss',
    });
    expect(tiny.fiberGrams).toBeGreaterThanOrEqual(15);
    expect(tiny.fiberGrams).toBeLessThanOrEqual(60);
  });
});

describe('summarizeWeightTrend', () => {
  it('fits a rate and a smoothed current weight', () => {
    const trend = summarizeWeightTrend(readingsOver(29, 84, 82))!;
    expect(trend.readings).toBe(29);
    expect(trend.spanDays).toBe(28);
    expect(trend.changeKgPerWeek).toBeCloseTo(-0.5, 2);
    expect(trend.smoothedWeightKg).toBeCloseTo(82, 5);
  });

  it('ignores a single noisy reading', () => {
    const clean = summarizeWeightTrend(readingsOver(29, 84, 82))!;
    const noisy = readingsOver(29, 84, 82);
    noisy[noisy.length - 1] = { ...noisy[noisy.length - 1], weightKg: 85 };
    const spiked = summarizeWeightTrend(noisy)!;
    expect(Math.abs(spiked.smoothedWeightKg - clean.smoothedWeightKg)).toBeLessThan(0.7);
  });

  it('needs at least two usable readings', () => {
    expect(summarizeWeightTrend([])).toBeNull();
    expect(summarizeWeightTrend(readingsOver(29, 84, 82).slice(0, 1))).toBeNull();
  });
});

describe('observedMaintenanceCalories', () => {
  const trend = summarizeWeightTrend(readingsOver(29, 84, 82))!;

  it('back-calculates maintenance from intake and weight change', () => {
    // Losing 0.5 kg/week on 2200 kcal implies burning ~550 kcal/day more than eaten.
    const observed = observedMaintenanceCalories(trend, { averageDailyCalories: 2200, loggedDays: 20 })!;
    expect(observed).toBeCloseTo(2200 + (0.5 * 7700) / 7, 0);
  });

  it('refuses to guess from thin data', () => {
    expect(observedMaintenanceCalories(trend, { averageDailyCalories: 2200, loggedDays: 4 })).toBeNull();
    expect(observedMaintenanceCalories(summarizeWeightTrend(readingsOver(3, 84, 83.8)), { averageDailyCalories: 2200, loggedDays: 20 })).toBeNull();
    expect(observedMaintenanceCalories(null, { averageDailyCalories: 2200, loggedDays: 20 })).toBeNull();
  });
});

describe('goalAdjustmentScale', () => {
  it('eases off as goal weight approaches', () => {
    expect(goalAdjustmentScale(80, 70, -0.2)).toBe(1);
    expect(goalAdjustmentScale(80, 79.2, -0.2)).toBeCloseTo(1 / 3, 3);
    expect(goalAdjustmentScale(80, 80, -0.2)).toBe(0);
  });

  it('leaves the adjustment alone when the goal points the other way', () => {
    expect(goalAdjustmentScale(80, 85, -0.2)).toBe(1);
    expect(goalAdjustmentScale(80, 75, 0.1)).toBe(1);
  });

  it('is inert without a goal weight or an adjustment', () => {
    expect(goalAdjustmentScale(80, null, -0.2)).toBe(1);
    expect(goalAdjustmentScale(80, 70, 0)).toBe(1);
  });
});

describe('calculateNutritionTargets with history', () => {
  const cutting: TargetInputs = { ...reference, goalType: 'fat_loss' };

  it('prefers the trend weight over the last reading', () => {
    const trend = summarizeWeightTrend(readingsOver(29, 84, 82))!;
    const withTrend = calculateNutritionTargets({ ...cutting, weightKg: 85.4, trend });
    const atTrendWeight = calculateNutritionTargets({ ...cutting, weightKg: trend.smoothedWeightKg });
    expect(withTrend.calories).toBe(atTrendWeight.calories);
    expect(withTrend.proteinGrams).toBe(atTrendWeight.proteinGrams);
  });

  it('uses measured maintenance once intake and weight history exist', () => {
    const trend = summarizeWeightTrend(readingsOver(29, 84, 82))!;
    const targets = calculateNutritionTargets({ ...cutting, trend, intake: { averageDailyCalories: 2200, loggedDays: 20 } });
    expect(targets.maintenanceFromObservation).toBe(true);
    expect(targets.maintenanceCalories).not.toBe(calculateNutritionTargets({ ...cutting, trend }).maintenanceCalories);
  });

  it('clamps measured maintenance to a sane band around the formula', () => {
    const trend = summarizeWeightTrend(readingsOver(29, 84, 82))!;
    const formula = calculateNutritionTargets({ ...cutting, trend }).maintenanceCalories;
    const absurd = calculateNutritionTargets({ ...cutting, trend, intake: { averageDailyCalories: 9000, loggedDays: 20 } });
    expect(absurd.maintenanceCalories).toBeLessThanOrEqual(Math.round(formula * 1.2) + 1);
  });

  it('tapers the deficit near goal weight', () => {
    const far = calculateNutritionTargets({ ...cutting, targetWeightKg: 70 });
    const close = calculateNutritionTargets({ ...cutting, targetWeightKg: 79.5 });
    expect(far.goalAdjustmentScale).toBe(1);
    expect(close.goalAdjustmentScale).toBeLessThan(1);
    expect(close.calories).toBeGreaterThan(far.calories);
  });
});

describe('ageFromBirthDate', () => {
  it('counts completed years only', () => {
    expect(ageFromBirthDate('1996-08-20', new Date('2026-08-14T12:00:00'))).toBe(29);
    expect(ageFromBirthDate('1996-08-14', new Date('2026-08-14T12:00:00'))).toBe(30);
    expect(ageFromBirthDate('1996-01-02', new Date('2026-08-14T12:00:00'))).toBe(30);
  });
});

describe('bodyFatAdjustmentScale', () => {
  const band = { min: 12, max: 18 };

  it('holds at maintenance once inside the goal band', () => {
    expect(bodyFatAdjustmentScale(15, band, -0.2)).toBe(0);
    expect(bodyFatAdjustmentScale(12, band, -0.2)).toBe(0);
    expect(bodyFatAdjustmentScale(18, band, 0.1)).toBe(0);
  });

  it('applies the full deficit while well above the band', () => {
    expect(bodyFatAdjustmentScale(30, band, -0.2)).toBe(1);
  });

  it('eases the deficit in over the last few points', () => {
    expect(bodyFatAdjustmentScale(19, band, -0.2)).toBeCloseTo(1 / 3, 5);
    expect(bodyFatAdjustmentScale(20, band, -0.2)).toBeCloseTo(2 / 3, 5);
    expect(bodyFatAdjustmentScale(21, band, -0.2)).toBe(1);
  });

  it('eases a surplus in when below the band', () => {
    expect(bodyFatAdjustmentScale(11, band, 0.1)).toBeCloseTo(1 / 3, 5);
    expect(bodyFatAdjustmentScale(5, band, 0.1)).toBe(1);
  });

  it('does not interfere when the goal points away from the gap', () => {
    // Above the band but bulking: body fat should not veto the surplus.
    expect(bodyFatAdjustmentScale(30, band, 0.1)).toBe(1);
    // Below the band but cutting.
    expect(bodyFatAdjustmentScale(5, band, -0.2)).toBe(1);
  });

  it('is inert without a band, a reading, or an adjustment', () => {
    expect(bodyFatAdjustmentScale(30, null, -0.2)).toBe(1);
    expect(bodyFatAdjustmentScale(null, band, -0.2)).toBe(1);
    expect(bodyFatAdjustmentScale(30, band, 0)).toBe(1);
  });
});

describe('body fat goal feeding calorie targets', () => {
  const base: TargetInputs = {
    weightKg: 80,
    heightCm: 178,
    age: 30,
    biologicalSex: 'male',
    trainingDaysPerWeek: 4,
    goalType: 'fat_loss',
  };

  it('cuts hard while far above the goal band', () => {
    const far = calculateNutritionTargets({ ...base, bodyFatPercent: 30, goalBodyFat: { min: 12, max: 18 } });
    expect(far.calories).toBe(Math.round(maintenanceCalories(base) * 0.8));
  });

  it('stops cutting once inside the goal band', () => {
    const inside = calculateNutritionTargets({ ...base, bodyFatPercent: 15, goalBodyFat: { min: 12, max: 18 } });
    expect(inside.calories).toBe(Math.round(maintenanceCalories(base)));
  });

  it('lands between the two while closing the last points', () => {
    const near = calculateNutritionTargets({ ...base, bodyFatPercent: 19, goalBodyFat: { min: 12, max: 18 } });
    const far = calculateNutritionTargets({ ...base, bodyFatPercent: 30, goalBodyFat: { min: 12, max: 18 } });
    const inside = calculateNutritionTargets({ ...base, bodyFatPercent: 15, goalBodyFat: { min: 12, max: 18 } });
    expect(near.calories).toBeGreaterThan(far.calories);
    expect(near.calories).toBeLessThan(inside.calories);
  });

  it('takes the gentler of the weight and body-fat tapers', () => {
    // Body fat says hold; goal weight is still far away. The hold wins.
    const targets = calculateNutritionTargets({
      ...base,
      bodyFatPercent: 15,
      goalBodyFat: { min: 12, max: 18 },
      targetWeightKg: 65,
    });
    expect(targets.goalAdjustmentScale).toBe(0);
  });
});
