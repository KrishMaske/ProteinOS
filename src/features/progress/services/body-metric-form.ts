import { cmToIn, inToCm, kgToLb, lbToKg } from '@/lib/units';
import type { Tables, TablesUpdate } from '@/types/database';

export type BodyMetricFormValues = {
  weight: string;
  waist: string;
  bodyFat: string;
  chest: string;
  arm: string;
  thigh: string;
  notes: string;
};

export type BodyMetricFormErrors = Partial<Record<Exclude<keyof BodyMetricFormValues, 'notes'>, string>>;

export type EditableBodyMetric = Pick<
  TablesUpdate<'body_metrics'>,
  'weight_kg' | 'waist_cm' | 'body_fat_percent' | 'chest_cm' | 'arm_cm' | 'thigh_cm' | 'notes'
>;

const metricFields = ['weight', 'waist', 'bodyFat', 'chest', 'arm', 'thigh'] as const;
const comparedFields: (keyof BodyMetricFormValues)[] = [...metricFields, 'notes'];

export const emptyBodyMetricForm: BodyMetricFormValues = {
  weight: '',
  waist: '',
  bodyFat: '',
  chest: '',
  arm: '',
  thigh: '',
  notes: '',
};

function numberOrNull(value: string) {
  return value.trim() === '' ? null : Number(value);
}

function displayNumber(value: number | null, convert?: (value: number) => number) {
  if (value === null) return '';
  const displayValue = convert ? convert(value) : value;
  return Number(displayValue.toFixed(2)).toString();
}

export function bodyMetricToFormValues(metric: Tables<'body_metrics'>, imperial: boolean): BodyMetricFormValues {
  const lengthConversion = imperial ? cmToIn : undefined;
  return {
    weight: displayNumber(metric.weight_kg, imperial ? kgToLb : undefined),
    waist: displayNumber(metric.waist_cm, lengthConversion),
    bodyFat: displayNumber(metric.body_fat_percent),
    chest: displayNumber(metric.chest_cm, lengthConversion),
    arm: displayNumber(metric.arm_cm, lengthConversion),
    thigh: displayNumber(metric.thigh_cm, lengthConversion),
    notes: metric.notes ?? '',
  };
}

export function validateBodyMetricForm(values: BodyMetricFormValues) {
  const errors: BodyMetricFormErrors = {};
  const hasMetric = metricFields.some((field) => values[field].trim() !== '');

  for (const field of metricFields) {
    const rawValue = values[field].trim();
    if (!rawValue) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) errors[field] = 'Enter a number above 0.';
  }

  const bodyFat = numberOrNull(values.bodyFat);
  if (bodyFat !== null && Number.isFinite(bodyFat) && bodyFat > 100) {
    errors.bodyFat = 'Enter a percentage from 0 to 100.';
  }

  return { hasMetric, errors, isValid: hasMetric && Object.keys(errors).length === 0 };
}

export function hasBodyMetricFormChanges(values: BodyMetricFormValues, initialValues: BodyMetricFormValues) {
  return comparedFields.some((field) => values[field] !== initialValues[field]);
}

export function bodyMetricFormToUpdate(values: BodyMetricFormValues, imperial: boolean, initialValues?: BodyMetricFormValues): EditableBodyMetric {
  const weight = numberOrNull(values.weight);
  const waist = numberOrNull(values.waist);
  const chest = numberOrNull(values.chest);
  const arm = numberOrNull(values.arm);
  const thigh = numberOrNull(values.thigh);
  const changed = (field: keyof BodyMetricFormValues) => !initialValues || values[field] !== initialValues[field];
  const update: EditableBodyMetric = {};

  if (changed('weight')) update.weight_kg = weight === null ? null : imperial ? lbToKg(weight) : weight;
  if (changed('waist')) update.waist_cm = waist === null ? null : imperial ? inToCm(waist) : waist;
  if (changed('bodyFat')) update.body_fat_percent = numberOrNull(values.bodyFat);
  if (changed('chest')) update.chest_cm = chest === null ? null : imperial ? inToCm(chest) : chest;
  if (changed('arm')) update.arm_cm = arm === null ? null : imperial ? inToCm(arm) : arm;
  if (changed('thigh')) update.thigh_cm = thigh === null ? null : imperial ? inToCm(thigh) : thigh;
  if (changed('notes')) update.notes = values.notes.trim() || null;
  return update;
}
