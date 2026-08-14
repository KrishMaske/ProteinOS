import type { BiologicalSex } from '@/features/nutrition/services/nutrition-targets';
import {
  bodyMassIndex,
  estimateBodyFat,
  type BodyFatEstimate,
} from '@/features/progress/services/body-composition';
import { localDateKey } from '@/lib/date';

export type BodyMetricReading = {
  measuredAt: string;
  weightKg?: number | null;
  waistCm?: number | null;
  bodyFatPercent?: number | null;
};

export type WeeklyBodyMetrics = {
  /** Local Monday that opens the week, as YYYY-MM-DD. */
  weekStart: string;
  /** How many log entries landed in the week — a one-reading average is not a trend. */
  readings: number;
  weightKg: number | null;
  waistCm: number | null;
  bodyFatPercent: number | null;
};

export type WeeklyComposition = WeeklyBodyMetrics & {
  bmi: number | null;
  fat: BodyFatEstimate | null;
};

export type CompositionProfile = {
  heightCm?: number | null;
  age?: number | null;
  biologicalSex?: BiologicalSex | null;
};

export type CompositionSummary = {
  current: WeeklyComposition;
  previous: WeeklyComposition | null;
  /** Week-over-week change, positive meaning an increase. Null without a comparable week. */
  bmiChange: number | null;
  bodyFatChange: number | null;
  weightChangeKg: number | null;
};

const METRIC_FIELDS = ['weightKg', 'waistCm', 'bodyFatPercent'] as const;

/** Monday of the week containing `date`, in local time. */
export function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay is 0 for Sunday, so shift the week to open on Monday.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function round(value: number | null, places = 2) {
  if (value === null) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function usable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Collapses individual readings into one row per calendar week, averaging each field
 * independently so a day where only the scale was used still contributes its weight.
 * Returned oldest first.
 */
export function groupIntoWeeks(readings: BodyMetricReading[]): WeeklyBodyMetrics[] {
  const buckets = new Map<string, BodyMetricReading[]>();
  for (const reading of readings) {
    const measured = new Date(reading.measuredAt);
    if (Number.isNaN(measured.getTime())) continue;
    const key = localDateKey(startOfWeek(measured));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(reading);
    else buckets.set(key, [reading]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, entries]) => {
      const averages = Object.fromEntries(
        METRIC_FIELDS.map((field) => [
          field,
          round(mean(entries.map((entry) => entry[field]).filter(usable))),
        ]),
      ) as Record<(typeof METRIC_FIELDS)[number], number | null>;
      return { weekStart, readings: entries.length, ...averages };
    });
}

/** Adds BMI and a body-fat estimate to each week, computed from that week's averages. */
export function weeklyComposition(
  readings: BodyMetricReading[],
  profile: CompositionProfile,
): WeeklyComposition[] {
  const heightCm = usable(profile.heightCm) ? profile.heightCm : null;
  return groupIntoWeeks(readings).map((week) => ({
    ...week,
    bmi: heightCm === null || week.weightKg === null ? null : bodyMassIndex(week.weightKg, heightCm),
    fat: heightCm === null
      ? null
      : estimateBodyFat({
          weightKg: week.weightKg ?? 0,
          heightCm,
          waistCm: week.waistCm,
          age: profile.age,
          biologicalSex: profile.biologicalSex,
          measuredBodyFatPercent: week.bodyFatPercent,
        }),
  }));
}

/**
 * The most recent week that produced a figure, plus the previous one for a delta.
 * Weeks with no usable measurement are skipped rather than reported as a drop to zero.
 */
export function summarizeComposition(
  readings: BodyMetricReading[],
  profile: CompositionProfile,
): CompositionSummary | null {
  const weeks = weeklyComposition(readings, profile).filter(
    (week) => week.bmi !== null || week.fat !== null,
  );
  if (!weeks.length) return null;

  const current = weeks[weeks.length - 1];
  const previous = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  const delta = (now: number | null | undefined, before: number | null | undefined) =>
    typeof now === 'number' && typeof before === 'number' ? round(now - before, 1) : null;

  return {
    current,
    previous,
    bmiChange: delta(current.bmi, previous?.bmi),
    bodyFatChange: delta(current.fat?.percent, previous?.fat?.percent),
    weightChangeKg: delta(current.weightKg, previous?.weightKg),
  };
}
