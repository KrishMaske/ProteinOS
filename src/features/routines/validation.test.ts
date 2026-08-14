import { describe, expect, it } from 'vitest'; import { routineDraftSchema } from './validation';
describe('routine validation', () => {
  const exercise = { exerciseId: '0025', targetSets: 3, repMin: 8, repMax: 12, restSeconds: 90, targetRpe: null, targetRir: 2, notes: null };
  const valid = { name: 'Upper', days: [{ name: 'Day 1', isRestDay: false, exercises: [exercise] }, { name: 'Rest', isRestDay: true, exercises: [] }] };

  it('accepts an ordered cycle with a rest slot', () => expect(routineDraftSchema.safeParse(valid).success).toBe(true));

  it('accepts a complete alternating A/B rotation', () => expect(routineDraftSchema.safeParse({
    name: 'Alternating split',
    days: ['Chest & Back A', 'Legs', 'Arms', 'Rest', 'Chest & Back B', 'Legs', 'Arms', 'Rest'].map((name) => ({
      name,
      isRestDay: name === 'Rest',
      exercises: name === 'Rest' ? [] : [exercise],
    })),
  }).success).toBe(true));

  it('rejects an inverted rep range', () => expect(routineDraftSchema.safeParse({ ...valid, days: [{ ...valid.days[0], exercises: [{ ...exercise, repMin: 12, repMax: 8 }] }] }).success).toBe(false));
  it('rejects exercises on a rest slot', () => expect(routineDraftSchema.safeParse({ ...valid, days: [{ ...valid.days[1], exercises: valid.days[0].exercises }] }).success).toBe(false));
});
