import type { Database } from '@/types/database';

export type GoalType = Database['public']['Enums']['goal_type'];
export type BiologicalSex = Database['public']['Enums']['biological_sex'];

export type WeightReading = { measuredAt: string; weightKg: number };
export type WeightTrend = {
  /** Regression value at the newest reading, so day-to-day water swings do not drive targets. */
  smoothedWeightKg: number;
  changeKgPerWeek: number;
  spanDays: number;
  readings: number;
};
export type IntakeSummary = { averageDailyCalories: number; loggedDays: number };

export type TargetInputs = {
  weightKg: number;
  heightCm: number;
  age: number;
  biologicalSex?: BiologicalSex | null;
  trainingDaysPerWeek?: number | null;
  goalType?: GoalType | null;
  targetWeightKg?: number | null;
  trend?: WeightTrend | null;
  intake?: IntakeSummary | null;
};

export type NutritionTargets = {
  calories: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  fiberGrams: number;
  basalMetabolicRate: number;
  maintenanceCalories: number;
  /** True when logged intake and weight change refined the formula estimate. */
  maintenanceFromObservation: boolean;
  /** 0–1 share of the goal's calorie adjustment applied after tapering near goal weight. */
  goalAdjustmentScale: number;
};

/**
 * Mifflin-St Jeor sex constants. An unstated sex uses their midpoint, which keeps the
 * estimate within ~80 kcal of either rather than silently assuming one.
 */
const SEX_CONSTANT: Record<BiologicalSex, number> = { male: 5, female: -161, unspecified: -78 };

/** Harris-Benedict activity multipliers, keyed by how many days a week the user trains. */
const ACTIVITY_BY_TRAINING_DAYS = [1.2, 1.2, 1.375, 1.375, 1.55, 1.55, 1.725, 1.9];

/** Fraction added to (or removed from) maintenance calories for each goal. */
const GOAL_CALORIE_ADJUSTMENT: Record<GoalType, number> = {
  fat_loss: -0.2,
  recomp: -0.05,
  maintenance: 0,
  strength: 0.05,
  muscle_gain: 0.1,
};

/** Grams of protein per kg of bodyweight. Deficits get more to protect lean mass. */
const GOAL_PROTEIN_PER_KG: Record<GoalType, number> = {
  fat_loss: 2.2,
  recomp: 2.2,
  maintenance: 1.6,
  strength: 1.8,
  muscle_gain: 1.8,
};

const CALORIES_PER_GRAM = { protein: 4, carbohydrate: 4, fat: 9 };
const FAT_CALORIE_SHARE = 0.25;
/** Hormone and fatty-acid floor; dropping below this is not worth the extra carbs. */
const MIN_FAT_PER_KG = 0.6;
/** Dietary Guidelines reference intake, expressed per 1000 kcal. */
const FIBER_PER_1000_KCAL = 14;
const ABSOLUTE_MIN_CALORIES = 1200;
/**
 * Bodyweight-based protein overshoots at high body fat, where the useful anchor is lean
 * mass. Capping protein's share of the budget keeps heavier cutters from an unworkable split.
 */
const MAX_PROTEIN_CALORIE_SHARE = 0.4;
/** Energy in one kilogram of bodyweight change, the usual 7700 kcal approximation. */
const KCAL_PER_KG = 7700;
/** Within this fraction of goal weight the calorie adjustment eases off linearly. */
const GOAL_TAPER_FRACTION = 0.03;
/** Observed maintenance is trusted only this far from the formula, guarding sparse logs. */
const OBSERVED_MAINTENANCE_TOLERANCE = 0.2;
const MIN_TREND_SPAN_DAYS = 14;
const MIN_TREND_READINGS = 6;
const MIN_INTAKE_DAYS = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function basalMetabolicRate({ weightKg, heightCm, age, biologicalSex }: TargetInputs) {
  const constant = SEX_CONSTANT[biologicalSex ?? 'unspecified'];
  return 10 * weightKg + 6.25 * heightCm - 5 * age + constant;
}

export function activityMultiplier(trainingDaysPerWeek?: number | null) {
  const days = clamp(Math.round(trainingDaysPerWeek ?? 3), 0, 7);
  return ACTIVITY_BY_TRAINING_DAYS[days];
}

export function maintenanceCalories(inputs: TargetInputs) {
  return basalMetabolicRate(inputs) * activityMultiplier(inputs.trainingDaysPerWeek);
}

/**
 * Least-squares fit over the readings so a single heavy morning cannot move the target.
 * Returns the fitted weight at the newest reading plus the weekly rate of change.
 */
export function summarizeWeightTrend(readings: WeightReading[]): WeightTrend | null {
  const points = readings
    .filter((reading) => Number.isFinite(reading.weightKg) && reading.weightKg > 0)
    .map((reading) => ({ time: new Date(reading.measuredAt).getTime(), weightKg: reading.weightKg }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  if (points.length < 2) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const first = points[0].time;
  const xs = points.map((point) => (point.time - first) / dayMs);
  const ys = points.map((point) => point.weightKg);
  const spanDays = xs[xs.length - 1];
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const variance = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  const covariance = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
  const slope = variance === 0 ? 0 : covariance / variance;

  return {
    smoothedWeightKg: meanY + slope * (xs[xs.length - 1] - meanX),
    changeKgPerWeek: slope * 7,
    spanDays,
    readings: points.length,
  };
}

/**
 * Back-calculates true maintenance from what was actually eaten and what the scale did,
 * which beats any equation once there is enough history. Null when the data is too thin.
 */
export function observedMaintenanceCalories(trend?: WeightTrend | null, intake?: IntakeSummary | null) {
  if (!trend || !intake) return null;
  if (trend.spanDays < MIN_TREND_SPAN_DAYS || trend.readings < MIN_TREND_READINGS) return null;
  if (intake.loggedDays < MIN_INTAKE_DAYS || intake.averageDailyCalories <= 0) return null;
  return intake.averageDailyCalories - (trend.changeKgPerWeek * KCAL_PER_KG) / 7;
}

/**
 * Eases the deficit or surplus off as goal weight approaches, so the last kilogram is not
 * chased with the same aggression as the first. Only applies when the goal and the gap agree.
 */
export function goalAdjustmentScale(weightKg: number, targetWeightKg: number | null | undefined, adjustment: number) {
  if (!targetWeightKg || adjustment === 0 || weightKg <= 0) return 1;
  const gap = targetWeightKg - weightKg;
  // Sitting exactly on goal weight means hold, regardless of which way the goal points.
  if (gap === 0) return 0;
  if (Math.sign(gap) !== Math.sign(adjustment)) return 1;
  return clamp(Math.abs(gap) / weightKg / GOAL_TAPER_FRACTION, 0, 1);
}

/**
 * Derives a full macro target from body composition inputs. Protein is set from
 * bodyweight and fat from a share of calories, then carbohydrates take whatever
 * energy is left, so the three macros always add back up to the calorie target.
 */
export function calculateNutritionTargets(inputs: TargetInputs): NutritionTargets {
  // The trend weight, when there is one, is a truer picture of bodyweight than the last reading.
  const weightKg = inputs.trend?.smoothedWeightKg ?? inputs.weightKg;
  const resolved = { ...inputs, weightKg };
  const bmr = basalMetabolicRate(resolved);
  const formulaMaintenance = maintenanceCalories(resolved);
  const observed = observedMaintenanceCalories(inputs.trend, inputs.intake);
  const maintenance = observed === null
    ? formulaMaintenance
    : clamp(
        observed,
        formulaMaintenance * (1 - OBSERVED_MAINTENANCE_TOLERANCE),
        formulaMaintenance * (1 + OBSERVED_MAINTENANCE_TOLERANCE),
      );

  const goal = inputs.goalType ?? 'maintenance';
  const baseAdjustment = GOAL_CALORIE_ADJUSTMENT[goal];
  const scale = goalAdjustmentScale(weightKg, inputs.targetWeightKg, baseAdjustment);
  const adjusted = maintenance * (1 + baseAdjustment * scale);
  // Never prescribe a deficit that dips under resting expenditure.
  const calories = Math.round(Math.max(adjusted, bmr, ABSOLUTE_MIN_CALORIES));

  const proteinGrams = Math.round(
    Math.min(
      weightKg * GOAL_PROTEIN_PER_KG[goal],
      (calories * MAX_PROTEIN_CALORIE_SHARE) / CALORIES_PER_GRAM.protein,
    ),
  );
  const proteinCalories = proteinGrams * CALORIES_PER_GRAM.protein;

  const fatFloorGrams = weightKg * MIN_FAT_PER_KG;
  const fatShareGrams = (calories * FAT_CALORIE_SHARE) / CALORIES_PER_GRAM.fat;
  // Leave at least a tenth of the budget for carbohydrates before honouring the floor.
  const fatCeilingGrams = Math.max(0, (calories * 0.9 - proteinCalories) / CALORIES_PER_GRAM.fat);
  const fatGrams = Math.round(Math.min(Math.max(fatShareGrams, fatFloorGrams), fatCeilingGrams));

  const remainingCalories = calories - proteinCalories - fatGrams * CALORIES_PER_GRAM.fat;
  const carbohydrateGrams = Math.max(0, Math.round(remainingCalories / CALORIES_PER_GRAM.carbohydrate));

  return {
    calories,
    proteinGrams,
    carbohydrateGrams,
    fatGrams,
    fiberGrams: clamp(Math.round((calories / 1000) * FIBER_PER_1000_KCAL), 15, 60),
    basalMetabolicRate: Math.round(bmr),
    maintenanceCalories: Math.round(maintenance),
    maintenanceFromObservation: observed !== null,
    goalAdjustmentScale: scale,
  };
}

export function ageFromBirthDate(birthDate: string, today = new Date()) {
  const born = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - born.getFullYear();
  const monthDelta = today.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) age -= 1;
  return age;
}
