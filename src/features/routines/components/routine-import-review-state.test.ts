import { describe, expect, it } from 'vitest';

import {
  reviewedKeysAfterSelectionChange,
  shouldStackRoutineImportFooter,
} from './routine-import-review-state';

describe('routine import review state', () => {
  it('does not mark a new valid selection as reviewed', () => {
    expect(reviewedKeysAfterSelectionChange(
      [],
      'bench',
      undefined,
      { type: 'catalog', exerciseId: 'catalog-bench' },
    )).toEqual([]);
  });

  it('keeps acceptance when the selection did not change', () => {
    const reviewed = ['bench'];
    expect(reviewedKeysAfterSelectionChange(
      reviewed,
      'bench',
      { type: 'catalog', exerciseId: 'catalog-bench' },
      { type: 'catalog', exerciseId: 'catalog-bench' },
    )).toBe(reviewed);
  });

  it('requires reacceptance after changing a catalog choice', () => {
    expect(reviewedKeysAfterSelectionChange(
      ['bench', 'row'],
      'bench',
      { type: 'catalog', exerciseId: 'catalog-bench' },
      { type: 'catalog', exerciseId: 'catalog-incline-bench' },
    )).toEqual(['row']);
  });

  it('requires reacceptance after editing a custom name or image choice', () => {
    expect(reviewedKeysAfterSelectionChange(
      ['pulldown'],
      'pulldown',
      { type: 'custom', customName: 'Cable Pulldown', useStagedImage: true },
      { type: 'custom', customName: 'Single-arm Pulldown', useStagedImage: true },
    )).toEqual([]);

    expect(reviewedKeysAfterSelectionChange(
      ['pulldown'],
      'pulldown',
      { type: 'custom', customName: 'Cable Pulldown', useStagedImage: true },
      { type: 'custom', customName: 'Cable Pulldown', useStagedImage: false },
    )).toEqual([]);
  });

  it('stacks footer controls on narrow screens or enlarged text', () => {
    expect(shouldStackRoutineImportFooter(390, 1)).toBe(true);
    expect(shouldStackRoutineImportFooter(500, 1.2)).toBe(true);
    expect(shouldStackRoutineImportFooter(500, 1)).toBe(false);
  });
});
