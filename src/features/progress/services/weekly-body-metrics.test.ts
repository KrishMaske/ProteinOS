import { describe, expect, it } from 'vitest';

import {
  groupIntoWeeks,
  startOfWeek,
  summarizeComposition,
  weeklyComposition,
  type BodyMetricReading,
} from './weekly-body-metrics';

const profile = { heightCm: 178, age: 30, biologicalSex: 'male' as const };

/** Local-time reading so week bucketing is tested the way the app runs it. */
function reading(day: string, values: Partial<BodyMetricReading> = {}): BodyMetricReading {
  return { measuredAt: `${day}T08:00:00`, ...values };
}

describe('startOfWeek', () => {
  it('opens the week on Monday', () => {
    // 2026-08-12 is a Wednesday.
    expect(startOfWeek(new Date('2026-08-12T12:00:00')).getDate()).toBe(10);
    // Monday itself is unchanged.
    expect(startOfWeek(new Date('2026-08-10T12:00:00')).getDate()).toBe(10);
    // Sunday belongs to the week that started six days earlier, not the next one.
    expect(startOfWeek(new Date('2026-08-16T12:00:00')).getDate()).toBe(10);
    expect(startOfWeek(new Date('2026-08-17T12:00:00')).getDate()).toBe(17);
  });
});

describe('groupIntoWeeks', () => {
  it('averages daily readings into one row per week', () => {
    const weeks = groupIntoWeeks([
      reading('2026-08-10', { weightKg: 80 }),
      reading('2026-08-11', { weightKg: 81 }),
      reading('2026-08-12', { weightKg: 79 }),
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toBe('2026-08-10');
    expect(weeks[0].readings).toBe(3);
    expect(weeks[0].weightKg).toBe(80);
  });

  it('averages each field independently so partial logs still count', () => {
    const weeks = groupIntoWeeks([
      reading('2026-08-10', { weightKg: 80 }),
      reading('2026-08-12', { weightKg: 82, waistCm: 86 }),
      reading('2026-08-13', { waistCm: 84 }),
    ]);
    expect(weeks[0].weightKg).toBe(81);
    // Waist averages only the two days it was measured, not three.
    expect(weeks[0].waistCm).toBe(85);
  });

  it('separates calendar weeks and returns them oldest first', () => {
    const weeks = groupIntoWeeks([
      reading('2026-08-17', { weightKg: 79 }),
      reading('2026-08-10', { weightKg: 81 }),
      reading('2026-08-16', { weightKg: 80 }),
    ]);
    expect(weeks.map((week) => week.weekStart)).toEqual(['2026-08-10', '2026-08-17']);
    // The 16th is a Sunday, so it belongs with the 10th.
    expect(weeks[0].readings).toBe(2);
    expect(weeks[1].weightKg).toBe(79);
  });

  it('ignores unusable values instead of dragging an average toward zero', () => {
    const weeks = groupIntoWeeks([
      reading('2026-08-10', { weightKg: 80 }),
      reading('2026-08-11', { weightKg: null }),
      reading('2026-08-12', { weightKg: 0 }),
    ]);
    expect(weeks[0].weightKg).toBe(80);
    expect(weeks[0].readings).toBe(3);
  });

  it('skips unparseable timestamps', () => {
    expect(groupIntoWeeks([{ measuredAt: 'not-a-date', weightKg: 80 }])).toEqual([]);
  });
});

describe('weeklyComposition', () => {
  it('derives BMI and body fat from the week average, not a single day', () => {
    const weeks = weeklyComposition(
      [
        reading('2026-08-10', { weightKg: 79, waistCm: 84 }),
        reading('2026-08-11', { weightKg: 81, waistCm: 86 }),
      ],
      profile,
    );
    // Averages are 80kg and 85cm, matching the hand-checked single-point case.
    expect(weeks[0].bmi).toBe(25.25);
    expect(weeks[0].fat?.percent).toBe(22.1);
    expect(weeks[0].fat?.method).toBe('rfm');
  });

  it('still reports body fat for a week with a waist but no weigh-in', () => {
    const weeks = weeklyComposition([reading('2026-08-10', { waistCm: 85 })], profile);
    expect(weeks[0].bmi).toBeNull();
    expect(weeks[0].fat?.percent).toBe(22.1);
    // Without a weight there is no mass split to report.
    expect(weeks[0].fat?.fatMassKg).toBeNull();
    expect(weeks[0].fat?.leanMassKg).toBeNull();
  });

  it('produces nothing derivable without a height', () => {
    const weeks = weeklyComposition([reading('2026-08-10', { weightKg: 80 })], { age: 30 });
    expect(weeks[0].bmi).toBeNull();
    expect(weeks[0].fat).toBeNull();
  });
});

describe('summarizeComposition', () => {
  const twoWeeks = [
    reading('2026-08-03', { weightKg: 82, waistCm: 88 }),
    reading('2026-08-05', { weightKg: 82, waistCm: 88 }),
    reading('2026-08-10', { weightKg: 80, waistCm: 85 }),
    reading('2026-08-12', { weightKg: 80, waistCm: 85 }),
  ];

  it('compares the newest week against the one before it', () => {
    const summary = summarizeComposition(twoWeeks, profile)!;
    expect(summary.current.weekStart).toBe('2026-08-10');
    expect(summary.previous?.weekStart).toBe('2026-08-03');
    expect(summary.weightChangeKg).toBe(-2);
    // Waist fell, so body fat should fall too.
    expect(summary.bodyFatChange).toBeLessThan(0);
    expect(summary.bmiChange).toBeLessThan(0);
  });

  it('reports no delta when only one week has been logged', () => {
    const summary = summarizeComposition(twoWeeks.slice(2), profile)!;
    expect(summary.previous).toBeNull();
    expect(summary.bodyFatChange).toBeNull();
    expect(summary.weightChangeKg).toBeNull();
  });

  it('skips weeks that produced no figure rather than reading them as a drop', () => {
    const summary = summarizeComposition(
      [...twoWeeks, { measuredAt: '2026-08-18T08:00:00', notes: 'rest' } as BodyMetricReading],
      profile,
    )!;
    // The empty week is not the current one.
    expect(summary.current.weekStart).toBe('2026-08-10');
  });

  it('returns null when there is nothing to summarize', () => {
    expect(summarizeComposition([], profile)).toBeNull();
    expect(summarizeComposition([reading('2026-08-10', { weightKg: 80 })], {})).toBeNull();
  });

  it('smooths a noisy week so one heavy morning does not move the number', () => {
    const steady = summarizeComposition(
      [reading('2026-08-10', { weightKg: 80 }), reading('2026-08-11', { weightKg: 80 })],
      profile,
    )!;
    const withSpike = summarizeComposition(
      [
        reading('2026-08-10', { weightKg: 80 }),
        reading('2026-08-11', { weightKg: 80 }),
        reading('2026-08-12', { weightKg: 83 }),
      ],
      profile,
    )!;
    // A 3kg spike on one of three days moves the weekly BMI by about a third of that.
    expect(withSpike.current.bmi! - steady.current.bmi!).toBeLessThan(0.4);
  });
});
