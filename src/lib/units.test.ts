import { describe, expect, it } from 'vitest';
import { cmToIn, inToCm, kgToLb, lbToKg, roundToIncrement } from '@/lib/units';
describe('unit conversion', () => { it('round trips canonical mass', () => expect(lbToKg(kgToLb(82.4))).toBeCloseTo(82.4, 8)); it('round trips canonical length', () => expect(inToCm(cmToIn(175))).toBeCloseTo(175, 8)); it('rounds to gym increments', () => expect(roundToIncrement(102.4, 2.5)).toBe(102.5)); });
