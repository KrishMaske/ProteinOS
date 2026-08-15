/**
 * Body-composition maths for the Coach, mirroring
 * src/features/progress/services/body-composition.ts exactly.
 *
 * The two copies exist because the app and the edge runtime do not share a module tree.
 * body-composition-parity.test.ts imports both and asserts identical output across a grid
 * of inputs, so a change to one that is not made to the other fails the suite rather than
 * letting Coach quote a body fat the app never showed.
 *
 * Deliberately free of Deno APIs and imports so the test can load it directly.
 */

export type BiologicalSex = 'male' | 'female' | 'unspecified';
export type BodyFatMethod = 'measured' | 'rfm' | 'deurenberg';

const RFM_INTERCEPT: Record<BiologicalSex, number> = { male: 64, female: 76, unspecified: 70 };
const DEURENBERG_SEX: Record<BiologicalSex, number> = { male: 1, female: 0, unspecified: 0.5 };

export const HEALTHY_BMI = { min: 18.5, max: 24.9 } as const;

/** Gallagher et al. (2000) Table 4: body fat predicted at BMI 18.5 and 25, by age band. */
const HEALTHY_BODY_FAT: Record<BiologicalSex, { maxAge: number; min: number; max: number }[]> = {
  male: [
    { maxAge: 39, min: 8, max: 20 },
    { maxAge: 59, min: 11, max: 22 },
    { maxAge: Infinity, min: 13, max: 25 },
  ],
  female: [
    { maxAge: 39, min: 21, max: 33 },
    { maxAge: 59, min: 23, max: 34 },
    { maxAge: Infinity, min: 24, max: 36 },
  ],
  unspecified: [
    { maxAge: 39, min: 14.5, max: 26.5 },
    { maxAge: 59, min: 17, max: 28 },
    { maxAge: Infinity, min: 18.5, max: 30.5 },
  ],
};

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function bodyMassIndex(weightKg: number, heightCm: number): number | null {
  if (!isPositive(weightKg) || !isPositive(heightCm)) return null;
  const heightM = heightCm / 100;
  return round(weightKg / (heightM * heightM), 2);
}

export function healthyWeightRangeKg(heightCm: number) {
  if (!isPositive(heightCm)) return null;
  const heightM = heightCm / 100;
  return {
    minKg: round(HEALTHY_BMI.min * heightM * heightM),
    maxKg: round(HEALTHY_BMI.max * heightM * heightM),
  };
}

export function healthyBodyFatRange(age: number | null | undefined, biologicalSex?: BiologicalSex | null) {
  if (!isPositive(age)) return null;
  const bands = HEALTHY_BODY_FAT[biologicalSex ?? 'unspecified'];
  return bands.find((entry) => age <= entry.maxAge)!;
}

export type BodyCompositionInputs = {
  weightKg: number;
  heightCm: number;
  waistCm?: number | null;
  age?: number | null;
  biologicalSex?: BiologicalSex | null;
  measuredBodyFatPercent?: number | null;
};

export function estimateBodyFat(inputs: BodyCompositionInputs) {
  const { weightKg, heightCm, waistCm, age, biologicalSex, measuredBodyFatPercent } = inputs;
  const sex = biologicalSex ?? 'unspecified';

  let percent: number;
  let method: BodyFatMethod;
  if (isPositive(measuredBodyFatPercent) && measuredBodyFatPercent <= 100) {
    percent = round(measuredBodyFatPercent);
    method = 'measured';
  } else if (isPositive(waistCm) && isPositive(heightCm)) {
    percent = round(RFM_INTERCEPT[sex] - 20 * (heightCm / waistCm));
    method = 'rfm';
  } else {
    const bmi = bodyMassIndex(weightKg, heightCm);
    if (bmi === null || !isPositive(age)) return null;
    percent = round(1.2 * bmi + 0.23 * age - 10.8 * DEURENBERG_SEX[sex] - 5.4);
    method = 'deurenberg';
  }

  const clamped = Math.min(75, Math.max(2, percent));
  const fatMassKg = isPositive(weightKg) ? round(weightKg * (clamped / 100)) : null;
  return {
    percent: clamped,
    method,
    fatMassKg,
    leanMassKg: fatMassKg === null ? null : round(weightKg - fatMassKg),
  };
}

/** Monday-opening week key, matching the app's weekly averaging. */
export function weekStartKey(measuredAt: string) {
  const date = new Date(measuredAt);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const month = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${start.getFullYear()}-${month}-${day}`;
}
