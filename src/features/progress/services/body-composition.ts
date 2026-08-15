import type { BiologicalSex } from '@/features/nutrition/services/nutrition-targets';

export type BmiCategory = 'underweight' | 'healthy' | 'overweight' | 'obese';
export type BodyFatCategory = 'essential' | 'athletic' | 'fitness' | 'average' | 'obese';
export type BodyFatMethod = 'measured' | 'rfm' | 'deurenberg';

export type BodyCompositionInputs = {
  weightKg: number;
  heightCm: number;
  waistCm?: number | null;
  age?: number | null;
  biologicalSex?: BiologicalSex | null;
  /** A directly measured reading (DXA, calipers, smart scale) always wins over an estimate. */
  measuredBodyFatPercent?: number | null;
};

export type BodyFatEstimate = {
  percent: number;
  method: BodyFatMethod;
  /** Approximate standard error against DXA, in percentage points. Null when measured. */
  standardErrorPoints: number | null;
  category: BodyFatCategory;
  /** Null when no weight is on record — the percentage is still valid without it. */
  fatMassKg: number | null;
  leanMassKg: number | null;
};

/**
 * Relative Fat Mass (Woolcott & Bergman, 2018). The sex term is the whole difference
 * between the two published equations, so an unstated sex takes their midpoint rather
 * than silently assuming one — the same convention the calorie targets use.
 */
const RFM_INTERCEPT: Record<BiologicalSex, number> = { male: 64, female: 76, unspecified: 70 };
/** Deurenberg's sex coefficient: 1 for male, 0 for female, midpoint when unstated. */
const DEURENBERG_SEX: Record<BiologicalSex, number> = { male: 1, female: 0, unspecified: 0.5 };

const RFM_STANDARD_ERROR_POINTS = 5.2;
const DEURENBERG_STANDARD_ERROR_POINTS = 4.1;

/** World Health Organization adult cut-offs. */
const BMI_CUTOFFS: { max: number; category: BmiCategory }[] = [
  { max: 18.5, category: 'underweight' },
  { max: 25, category: 'healthy' },
  { max: 30, category: 'overweight' },
  { max: Infinity, category: 'obese' },
];

/** American Council on Exercise ranges. Upper bound of each band, by sex. */
const BODY_FAT_BANDS: Record<BiologicalSex, { max: number; category: BodyFatCategory }[]> = {
  male: [
    { max: 6, category: 'essential' },
    { max: 14, category: 'athletic' },
    { max: 18, category: 'fitness' },
    { max: 25, category: 'average' },
    { max: Infinity, category: 'obese' },
  ],
  female: [
    { max: 14, category: 'essential' },
    { max: 21, category: 'athletic' },
    { max: 25, category: 'fitness' },
    { max: 32, category: 'average' },
    { max: Infinity, category: 'obese' },
  ],
  unspecified: [
    { max: 10, category: 'essential' },
    { max: 17.5, category: 'athletic' },
    { max: 21.5, category: 'fitness' },
    { max: 28.5, category: 'average' },
    { max: Infinity, category: 'obese' },
  ],
};

/** WHO healthy adult BMI band, used for both the gauge and the healthy weight range. */
export const HEALTHY_BMI = { min: 18.5, max: 24.9 } as const;

/**
 * Healthy body-fat bands by age and sex (Gallagher et al., 2000). Body fat rises with age
 * at a constant health risk, so a single band across all ages would mislabel older adults.
 */
const HEALTHY_BODY_FAT: Record<BiologicalSex, { maxAge: number; min: number; max: number }[]> = {
  // Transcribed from Table 4 of the paper (4-compartment estimates, African Americans and
  // whites): the body fat predicted at BMI 18.5 and at BMI 25 for each age band.
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
  // Midpoints of the two published sets, consistent with how BMR and RFM treat an
  // unstated sex.
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

/** Body Mass Index in kg/m². Exact arithmetic, no estimation involved. */
export function bodyMassIndex(weightKg: number, heightCm: number): number | null {
  if (!isPositive(weightKg) || !isPositive(heightCm)) return null;
  const heightM = heightCm / 100;
  return round(weightKg / (heightM * heightM), 2);
}

export function bmiCategory(bmi: number): BmiCategory {
  return BMI_CUTOFFS.find((band) => bmi < band.max)!.category;
}

export function bodyFatCategory(percent: number, biologicalSex?: BiologicalSex | null): BodyFatCategory {
  return BODY_FAT_BANDS[biologicalSex ?? 'unspecified'].find((band) => percent < band.max)!.category;
}

/**
 * Relative Fat Mass: 64 − 20 × (height / waist) for men, 76 − … for women.
 * Height and waist must share a unit; the ratio cancels it.
 */
export function relativeFatMass(
  heightCm: number,
  waistCm: number,
  biologicalSex?: BiologicalSex | null,
): number | null {
  if (!isPositive(heightCm) || !isPositive(waistCm)) return null;
  return round(RFM_INTERCEPT[biologicalSex ?? 'unspecified'] - 20 * (heightCm / waistCm));
}

/** Deurenberg (1991): BF% = 1.20 × BMI + 0.23 × age − 10.8 × sex − 5.4. */
export function deurenbergBodyFat(
  bmi: number,
  age: number,
  biologicalSex?: BiologicalSex | null,
): number | null {
  if (!isPositive(bmi) || !isPositive(age)) return null;
  return round(1.2 * bmi + 0.23 * age - 10.8 * DEURENBERG_SEX[biologicalSex ?? 'unspecified'] - 5.4);
}

/**
 * Picks the best available body-fat figure: a logged measurement first, then RFM when a
 * waist is on record, then the BMI-based Deurenberg equation. Returns null when even
 * Deurenberg's inputs are missing.
 */
export function estimateBodyFat(inputs: BodyCompositionInputs): BodyFatEstimate | null {
  const { weightKg, heightCm, waistCm, age, biologicalSex, measuredBodyFatPercent } = inputs;

  const resolved = isPositive(measuredBodyFatPercent) && measuredBodyFatPercent <= 100
    ? { percent: round(measuredBodyFatPercent), method: 'measured' as const, standardErrorPoints: null }
    : isPositive(waistCm) && isPositive(heightCm)
      ? { percent: relativeFatMass(heightCm, waistCm, biologicalSex)!, method: 'rfm' as const, standardErrorPoints: RFM_STANDARD_ERROR_POINTS }
      : (() => {
          const bmi = bodyMassIndex(weightKg, heightCm);
          if (bmi === null || !isPositive(age)) return null;
          const percent = deurenbergBodyFat(bmi, age, biologicalSex);
          return percent === null
            ? null
            : { percent, method: 'deurenberg' as const, standardErrorPoints: DEURENBERG_STANDARD_ERROR_POINTS };
        })();

  if (!resolved) return null;
  // Equations are unbounded and can run past physiological limits at extreme ratios.
  const percent = Math.min(75, Math.max(2, resolved.percent));
  const fatMassKg = isPositive(weightKg) ? round(weightKg * (percent / 100)) : null;

  return {
    percent,
    method: resolved.method,
    standardErrorPoints: resolved.standardErrorPoints,
    category: bodyFatCategory(percent, biologicalSex),
    fatMassKg,
    leanMassKg: fatMassKg === null ? null : round(weightKg - fatMassKg),
  };
}

/** The weight range that puts this height inside the healthy BMI band. */
export function healthyWeightRangeKg(heightCm: number) {
  if (!isPositive(heightCm)) return null;
  const heightM = heightCm / 100;
  return {
    minKg: round(HEALTHY_BMI.min * heightM * heightM),
    maxKg: round(HEALTHY_BMI.max * heightM * heightM),
  };
}

/**
 * Age- and sex-adjusted healthy body-fat band (Gallagher et al., 2000), the ranges that
 * correspond to a healthy BMI at each age. Returns null without an age rather than
 * assuming one: the bands differ by up to 6 points across the age groups, so a guessed
 * age would quietly change the verdict.
 */
export function healthyBodyFatRange(age: number | null | undefined, biologicalSex?: BiologicalSex | null) {
  if (!isPositive(age)) return null;
  const bands = HEALTHY_BODY_FAT[biologicalSex ?? 'unspecified'];
  return bands.find((entry) => age <= entry.maxAge)!;
}

/**
 * Where a value sits inside a band, as a fraction: 0 at the floor, 1 at the ceiling,
 * clamped outside so an extreme reading cannot overflow a gauge.
 */
export function positionInRange(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Human-readable derivations so a number on screen can be checked by hand rather than
 * taken on trust. Values are rounded the same way the displayed figures are.
 */
/** Formats a value in the user's own units so the shown sum matches the shown figures. */
export type UnitFormatter = {
  mass: (kg: number) => string;
  length: (cm: number) => string;
  /** BMI is always kg/m²; imperial needs the 703 factor to work in lb and inches. */
  bmi: (weightKg: number, heightCm: number) => string;
};

export function unitFormatter(imperial: boolean): UnitFormatter {
  const round1 = (value: number) => Math.round(value * 10) / 10;
  return {
    mass: (kg) => imperial ? `${round1(kg * 2.20462262)} lb` : `${round1(kg)} kg`,
    length: (cm) => imperial ? `${round1(cm / 2.54)} in` : `${round1(cm)} cm`,
    bmi: (weightKg, heightCm) => {
      if (!imperial) return `${round1(weightKg)} kg ÷ (${(heightCm / 100).toFixed(2)} m)²`;
      return `703 × ${round1(weightKg * 2.20462262)} lb ÷ (${round1(heightCm / 2.54)} in)²`;
    },
  };
}

export function explainBmi(weightKg: number, heightCm: number, units: UnitFormatter) {
  return `${units.bmi(weightKg, heightCm)} = ${bodyMassIndex(weightKg, heightCm)}`;
}

export function explainBodyFat(estimate: BodyFatEstimate, inputs: BodyCompositionInputs, units: UnitFormatter) {
  const sex = inputs.biologicalSex ?? 'unspecified';
  if (estimate.method === 'measured') return 'Taken from the body fat you logged.';
  if (estimate.method === 'rfm') {
    // The height-to-waist ratio cancels units, so either system gives the same answer.
    return `${RFM_INTERCEPT[sex]} − 20 × (${units.length(inputs.heightCm)} height ÷ ${units.length(inputs.waistCm!)} waist) = ${estimate.percent}%`;
  }
  const bmi = bodyMassIndex(inputs.weightKg, inputs.heightCm);
  return `1.20 × ${bmi} BMI + 0.23 × ${inputs.age} yrs − 10.8 × ${DEURENBERG_SEX[sex]} − 5.4 = ${estimate.percent}%`;
}

export function explainLeanMass(weightKg: number, percent: number, units: UnitFormatter) {
  return `${units.mass(weightKg)} × (100 − ${percent})% = ${units.mass(weightKg * (1 - percent / 100))} lean`;
}

export type RangeVerdict = 'below' | 'within' | 'above';

export function verdictForRange(value: number, min: number, max: number): RangeVerdict {
  if (value < min) return 'below';
  if (value > max) return 'above';
  return 'within';
}
