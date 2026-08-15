import { describe, expect, it } from 'vitest';

import {
  bmiCategory,
  bodyFatCategory,
  bodyMassIndex,
  deurenbergBodyFat,
  estimateBodyFat,
  healthyBodyFatRange,
  healthyWeightRangeKg,
  positionInRange,
  relativeFatMass,
  verdictForRange,
} from './body-composition';

describe('bodyMassIndex', () => {
  it('computes kg/m² against hand-checked values', () => {
    // 80 / 1.78^2 = 80 / 3.1684 = 25.2493...
    expect(bodyMassIndex(80, 178)).toBe(25.25);
    // 60 / 1.65^2 = 60 / 2.7225 = 22.0386...
    expect(bodyMassIndex(60, 165)).toBe(22.04);
    // 100 / 1.8^2 = 100 / 3.24 = 30.8642...
    expect(bodyMassIndex(100, 180)).toBe(30.86);
  });

  it('is unit-consistent: doubling mass doubles BMI', () => {
    expect(bodyMassIndex(160, 178)).toBe(bodyMassIndex(80, 178)! * 2);
  });

  it('rejects impossible inputs rather than returning NaN or Infinity', () => {
    expect(bodyMassIndex(0, 178)).toBeNull();
    expect(bodyMassIndex(80, 0)).toBeNull();
    expect(bodyMassIndex(-80, 178)).toBeNull();
    expect(bodyMassIndex(Number.NaN, 178)).toBeNull();
  });
});

describe('bmiCategory', () => {
  it('applies the WHO bands', () => {
    expect(bmiCategory(17)).toBe('underweight');
    expect(bmiCategory(22)).toBe('healthy');
    expect(bmiCategory(27)).toBe('overweight');
    expect(bmiCategory(31)).toBe('obese');
  });

  it('treats each cut-off as the start of the higher band', () => {
    expect(bmiCategory(18.49)).toBe('underweight');
    expect(bmiCategory(18.5)).toBe('healthy');
    expect(bmiCategory(24.99)).toBe('healthy');
    expect(bmiCategory(25)).toBe('overweight');
    expect(bmiCategory(29.99)).toBe('overweight');
    expect(bmiCategory(30)).toBe('obese');
  });
});

describe('relativeFatMass', () => {
  it('matches the published equations', () => {
    // Men: 64 - 20 * (178 / 85) = 64 - 41.8824 = 22.1176
    expect(relativeFatMass(178, 85, 'male')).toBe(22.1);
    // Women: 76 - 20 * (165 / 75) = 76 - 44 = 32
    expect(relativeFatMass(165, 75, 'female')).toBe(32);
  });

  it('uses the midpoint of the two equations when sex is unstated', () => {
    const male = relativeFatMass(170, 80, 'male')!;
    const female = relativeFatMass(170, 80, 'female')!;
    expect(relativeFatMass(170, 80, null)).toBe((male + female) / 2);
    expect(relativeFatMass(170, 80, 'unspecified')).toBe(27.5);
  });

  it('rises as waist grows at a fixed height', () => {
    const lean = relativeFatMass(178, 80, 'male')!;
    const larger = relativeFatMass(178, 95, 'male')!;
    expect(larger).toBeGreaterThan(lean);
  });

  it('is unit-agnostic because the ratio cancels', () => {
    // 178cm/85cm expressed in inches gives the same ratio, so the same result.
    expect(relativeFatMass(178 / 2.54, 85 / 2.54, 'male')).toBe(relativeFatMass(178, 85, 'male'));
  });

  it('rejects missing measurements', () => {
    expect(relativeFatMass(178, 0, 'male')).toBeNull();
    expect(relativeFatMass(0, 85, 'male')).toBeNull();
  });
});

describe('deurenbergBodyFat', () => {
  it('matches the published equation', () => {
    // 1.2*25.25 + 0.23*30 - 10.8*1 - 5.4 = 30.3 + 6.9 - 10.8 - 5.4 = 21
    expect(deurenbergBodyFat(25.25, 30, 'male')).toBe(21);
    // 1.2*22 + 0.23*40 - 0 - 5.4 = 26.4 + 9.2 - 5.4 = 30.2
    expect(deurenbergBodyFat(22, 40, 'female')).toBe(30.2);
  });

  it('separates the sexes by exactly the 10.8 point coefficient', () => {
    const male = deurenbergBodyFat(25, 30, 'male')!;
    const female = deurenbergBodyFat(25, 30, 'female')!;
    expect(Number((female - male).toFixed(1))).toBe(10.8);
    expect(deurenbergBodyFat(25, 30, 'unspecified')).toBe((male + female) / 2);
  });

  it('increases with age at a fixed BMI', () => {
    expect(deurenbergBodyFat(25, 50, 'male')!).toBeGreaterThan(deurenbergBodyFat(25, 25, 'male')!);
  });
});

describe('bodyFatCategory', () => {
  it('uses sex-specific ACE bands', () => {
    expect(bodyFatCategory(5, 'male')).toBe('essential');
    expect(bodyFatCategory(12, 'male')).toBe('athletic');
    expect(bodyFatCategory(16, 'male')).toBe('fitness');
    expect(bodyFatCategory(22, 'male')).toBe('average');
    expect(bodyFatCategory(30, 'male')).toBe('obese');

    // The same 22% reads very differently for a woman.
    expect(bodyFatCategory(22, 'female')).toBe('fitness');
    expect(bodyFatCategory(12, 'female')).toBe('essential');
    expect(bodyFatCategory(35, 'female')).toBe('obese');
  });
});

describe('estimateBodyFat', () => {
  const base = { weightKg: 80, heightCm: 178, age: 30, biologicalSex: 'male' as const };

  it('prefers a logged measurement over any equation', () => {
    const result = estimateBodyFat({ ...base, waistCm: 85, measuredBodyFatPercent: 18.4 })!;
    expect(result.method).toBe('measured');
    expect(result.percent).toBe(18.4);
    expect(result.standardErrorPoints).toBeNull();
  });

  it('falls back to RFM when a waist is on record', () => {
    const result = estimateBodyFat({ ...base, waistCm: 85 })!;
    expect(result.method).toBe('rfm');
    expect(result.percent).toBe(22.1);
    expect(result.standardErrorPoints).toBeGreaterThan(0);
  });

  it('falls back to Deurenberg when no waist has been measured', () => {
    const result = estimateBodyFat({ ...base })!;
    expect(result.method).toBe('deurenberg');
    // BMI 25.25 -> 21%
    expect(result.percent).toBe(21);
  });

  it('returns null when even the BMI-based fallback lacks inputs', () => {
    expect(estimateBodyFat({ weightKg: 80, heightCm: 178 })).toBeNull();
    expect(estimateBodyFat({ weightKg: 0, heightCm: 0, age: 30 })).toBeNull();
  });

  it('splits weight into fat and lean mass that add back up', () => {
    const result = estimateBodyFat({ ...base, waistCm: 85 })!;
    // 80 * 0.221 = 17.68 -> 17.7
    expect(result.fatMassKg).toBe(17.7);
    expect(result.leanMassKg).toBe(62.3);
    expect(result.fatMassKg! + result.leanMassKg!).toBeCloseTo(80, 5);
  });

  it('reports a percentage but no mass split when weight is unknown', () => {
    const result = estimateBodyFat({ weightKg: 0, heightCm: 178, waistCm: 85, biologicalSex: 'male' })!;
    expect(result.percent).toBe(22.1);
    expect(result.fatMassKg).toBeNull();
    expect(result.leanMassKg).toBeNull();
  });

  it('clamps physiologically impossible equation output', () => {
    // 64 - 20 * (200 / 50) = -16, which is not a body fat percentage.
    const tiny = estimateBodyFat({ weightKg: 60, heightCm: 200, waistCm: 50, biologicalSex: 'male' })!;
    expect(tiny.percent).toBe(2);
    // Deurenberg at an extreme BMI and age runs past any real value.
    const huge = estimateBodyFat({ weightKg: 200, heightCm: 150, age: 80, biologicalSex: 'female' })!;
    expect(huge.percent).toBe(75);
  });

  it('tracks a real cut: same height, smaller waist, lower body fat', () => {
    const before = estimateBodyFat({ ...base, weightKg: 88, waistCm: 96 })!;
    const after = estimateBodyFat({ ...base, weightKg: 80, waistCm: 85 })!;
    expect(after.percent).toBeLessThan(before.percent);
    expect(after.fatMassKg!).toBeLessThan(before.fatMassKg!);
    // The point of the plan: most of the 8kg lost should be fat, not lean tissue.
    const weightLost = 88 - 80;
    const fatLost = before.fatMassKg! - after.fatMassKg!;
    expect(fatLost / weightLost).toBeGreaterThan(0.5);
  });
});

describe('healthyWeightRangeKg', () => {
  it('derives the range from the WHO BMI band', () => {
    // 1.78^2 = 3.1684 -> 18.5*3.1684 = 58.6, 24.9*3.1684 = 78.9
    expect(healthyWeightRangeKg(178)).toEqual({ minKg: 58.6, maxKg: 78.9 });
  });

  it('scales with the square of height', () => {
    const short = healthyWeightRangeKg(160)!;
    const tall = healthyWeightRangeKg(190)!;
    expect(tall.minKg).toBeGreaterThan(short.minKg);
    expect(tall.maxKg).toBeGreaterThan(short.maxKg);
  });

  it('round-trips through BMI', () => {
    const range = healthyWeightRangeKg(178)!;
    expect(bodyMassIndex(range.minKg, 178)).toBeCloseTo(18.5, 1);
    expect(bodyMassIndex(range.maxKg, 178)).toBeCloseTo(24.9, 1);
  });

  it('rejects a missing height', () => {
    expect(healthyWeightRangeKg(0)).toBeNull();
  });
});

describe('healthyBodyFatRange', () => {
  it('uses the Gallagher bands for men', () => {
    expect(healthyBodyFatRange(30, 'male')).toMatchObject({ min: 8, max: 19 });
    expect(healthyBodyFatRange(45, 'male')).toMatchObject({ min: 11, max: 21 });
    expect(healthyBodyFatRange(65, 'male')).toMatchObject({ min: 13, max: 24 });
  });

  it('uses higher bands for women at the same age', () => {
    const male = healthyBodyFatRange(30, 'male');
    const female = healthyBodyFatRange(30, 'female');
    expect(female.min).toBeGreaterThan(male.min);
    expect(female.max).toBeGreaterThan(male.max);
  });

  it('rises with age rather than holding one band for life', () => {
    expect(healthyBodyFatRange(65, 'female').min).toBeGreaterThan(healthyBodyFatRange(25, 'female').min);
  });

  it('takes the midpoint of both sexes when unstated', () => {
    const male = healthyBodyFatRange(30, 'male');
    const female = healthyBodyFatRange(30, 'female');
    const neutral = healthyBodyFatRange(30, null);
    expect(neutral.min).toBe((male.min + female.min) / 2);
    expect(neutral.max).toBe((male.max + female.max) / 2);
  });

  it('assumes 30 when no age is on record', () => {
    expect(healthyBodyFatRange(null, 'male')).toMatchObject(healthyBodyFatRange(30, 'male'));
  });
});

describe('positionInRange', () => {
  it('maps the band onto 0..1', () => {
    expect(positionInRange(8, 8, 19)).toBe(0);
    expect(positionInRange(19, 8, 19)).toBe(1);
    expect(positionInRange(13.5, 8, 19)).toBeCloseTo(0.5, 2);
  });

  it('clamps outside the band so a gauge cannot overflow', () => {
    expect(positionInRange(2, 8, 19)).toBe(0);
    expect(positionInRange(40, 8, 19)).toBe(1);
  });

  it('is safe on a degenerate band', () => {
    expect(positionInRange(10, 20, 20)).toBe(0);
  });
});

describe('verdictForRange', () => {
  it('classifies against the band edges inclusively', () => {
    expect(verdictForRange(7, 8, 19)).toBe('below');
    expect(verdictForRange(8, 8, 19)).toBe('within');
    expect(verdictForRange(19, 8, 19)).toBe('within');
    expect(verdictForRange(20, 8, 19)).toBe('above');
  });
});
