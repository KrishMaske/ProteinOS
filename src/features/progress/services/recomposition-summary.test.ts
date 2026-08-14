import { describe, expect, it } from 'vitest';
import { summarizeRecomposition } from './recomposition-summary';

describe('summarizeRecomposition', () => {
  it('requires multiple measurements', () => {
    expect(summarizeRecomposition([]).kind).toBe('insufficient');
  });

  it('identifies stable weight with a smaller waist as a recomposition signal', () => {
    const summary = summarizeRecomposition([
      { measured_at: '2026-01-01', weight_kg: 80, waist_cm: 90 },
      { measured_at: '2026-02-01', weight_kg: 80.5, waist_cm: 87.5 },
    ]);
    expect(summary.kind).toBe('positive');
  });
});
