import { describe, expect, it } from 'vitest';

import * as app from './body-composition';
import * as coach from '../../../../supabase/functions/_shared/body-composition';

/**
 * The Coach edge function cannot import from src, so the composition maths exists twice.
 * These tests are the guard: they run both copies over a grid of inputs and fail if the
 * two ever disagree, which is what would let Coach quote a body fat the app never showed.
 */
const sexes = ['male', 'female', 'unspecified'] as const;
const weights = [48, 65.771, 80, 120, 180];
const heights = [150, 165, 177.8, 190];
const waists = [null, 68, 85, 96, 130];
const ages = [null, 18, 20, 39, 40, 59, 60, 75];

describe('body composition parity between the app and the Coach function', () => {
  it('agrees on BMI', () => {
    for (const weightKg of weights) {
      for (const heightCm of heights) {
        expect(coach.bodyMassIndex(weightKg, heightCm)).toBe(app.bodyMassIndex(weightKg, heightCm));
      }
    }
  });

  it('agrees on the healthy weight range', () => {
    for (const heightCm of heights) {
      expect(coach.healthyWeightRangeKg(heightCm)).toEqual(app.healthyWeightRangeKg(heightCm));
    }
  });

  it('agrees on the healthy body-fat band, including refusing to guess an age', () => {
    for (const age of ages) {
      for (const sex of sexes) {
        const fromCoach = coach.healthyBodyFatRange(age, sex);
        const fromApp = app.healthyBodyFatRange(age, sex);
        if (fromApp === null) {
          expect(fromCoach).toBeNull();
        } else {
          expect(fromCoach).toMatchObject({ min: fromApp.min, max: fromApp.max });
        }
      }
    }
  });

  it('agrees on body fat across every method, including the clamps', () => {
    let compared = 0;
    for (const weightKg of weights) {
      for (const heightCm of heights) {
        for (const waistCm of waists) {
          for (const age of ages) {
            for (const biologicalSex of sexes) {
              for (const measured of [null, 18.4]) {
                const inputs = { weightKg, heightCm, waistCm, age, biologicalSex, measuredBodyFatPercent: measured };
                const fromApp = app.estimateBodyFat(inputs);
                const fromCoach = coach.estimateBodyFat(inputs);
                if (fromApp === null) {
                  expect(fromCoach).toBeNull();
                } else {
                  expect(fromCoach).toMatchObject({
                    percent: fromApp.percent,
                    method: fromApp.method,
                    fatMassKg: fromApp.fatMassKg,
                    leanMassKg: fromApp.leanMassKg,
                  });
                }
                compared += 1;
              }
            }
          }
        }
      }
    }
    // Guards against the loops silently collapsing and the test passing on nothing.
    expect(compared).toBeGreaterThan(2000);
  });

  it('agrees on which Monday a reading belongs to', () => {
    for (const day of ['2026-08-10', '2026-08-12', '2026-08-16', '2026-08-17', '2026-01-01']) {
      const iso = `${day}T08:00:00`;
      const start = appStartOfWeek(new Date(iso));
      const month = String(start.getMonth() + 1).padStart(2, '0');
      const dayPart = String(start.getDate()).padStart(2, '0');
      expect(coach.weekStartKey(iso)).toBe(`${start.getFullYear()}-${month}-${dayPart}`);
    }
  });
});

/** Mirrors the app's startOfWeek, which lives in the weekly aggregation module. */
function appStartOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}
