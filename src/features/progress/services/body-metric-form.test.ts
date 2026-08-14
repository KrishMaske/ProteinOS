import { describe, expect, it } from 'vitest';

import type { Tables } from '@/types/database';
import { bodyMetricFormToUpdate, bodyMetricToFormValues, emptyBodyMetricForm, hasBodyMetricFormChanges, validateBodyMetricForm } from './body-metric-form';

describe('body metric form', () => {
  it('requires at least one valid measurement', () => {
    expect(validateBodyMetricForm(emptyBodyMetricForm).isValid).toBe(false);
    expect(validateBodyMetricForm({ ...emptyBodyMetricForm, weight: '175' })).toMatchObject({ hasMetric: true, isValid: true });
  });

  it('rejects non-positive values and body fat above 100 percent', () => {
    const result = validateBodyMetricForm({ ...emptyBodyMetricForm, weight: '-1', bodyFat: '101' });
    expect(result.errors.weight).toBeTruthy();
    expect(result.errors.bodyFat).toBeTruthy();
    expect(result.isValid).toBe(false);
  });

  it('converts imperial form values back to database units', () => {
    const result = bodyMetricFormToUpdate({ ...emptyBodyMetricForm, weight: '220.4623', waist: '39.3701', notes: '  morning  ' }, true);
    expect(result.weight_kg).toBeCloseTo(100, 3);
    expect(result.waist_cm).toBeCloseTo(100, 3);
    expect(result.notes).toBe('morning');
    expect(result.chest_cm).toBeNull();
  });

  it('prefills an imperial edit without carrying database-only fields', () => {
    const metric = {
      id: 'metric-1', user_id: 'user-1', measured_at: '2026-08-13T12:00:00Z', created_at: '2026-08-13T12:00:00Z', updated_at: '2026-08-13T12:00:00Z',
      weight_kg: 100, waist_cm: 100, body_fat_percent: 18.5, chest_cm: null, arm_cm: null, thigh_cm: null, notes: 'Morning',
    } satisfies Tables<'body_metrics'>;

    expect(bodyMetricToFormValues(metric, true)).toMatchObject({ weight: '220.46', waist: '39.37', bodyFat: '18.5', notes: 'Morning' });
  });

  it('only updates fields changed in edit mode so converted values do not drift', () => {
    const initial = { ...emptyBodyMetricForm, weight: '220.46', waist: '39.37', notes: 'Morning' };
    const edited = { ...initial, notes: 'Evening' };

    expect(hasBodyMetricFormChanges(edited, initial)).toBe(true);
    expect(bodyMetricFormToUpdate(edited, true, initial)).toEqual({ notes: 'Evening' });
    expect(hasBodyMetricFormChanges(initial, initial)).toBe(false);
  });
});
