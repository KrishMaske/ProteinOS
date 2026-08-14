import { describe, expect, it } from 'vitest';

import { isSetDraftCurrent, type PendingSetDraft } from './set-draft';

const draft: PendingSetDraft = { serverUpdatedAt: '2026-08-13T12:00:00Z', weightKg: 80, reps: 8 };

describe('workout set draft reconciliation', () => {
  it('restores a draft only against the exact unchanged server version', () => {
    expect(isSetDraftCurrent(draft, { updated_at: draft.serverUpdatedAt, completed_at: null })).toBe(true);
    expect(isSetDraftCurrent(draft, { updated_at: '2026-08-13T12:01:00Z', completed_at: null })).toBe(false);
  });

  it('always treats a completed server set as authoritative', () => {
    expect(isSetDraftCurrent(draft, { updated_at: draft.serverUpdatedAt, completed_at: '2026-08-13T12:00:30Z' })).toBe(false);
  });

  it('does not restore missing or legacy unversioned data', () => {
    expect(isSetDraftCurrent(undefined, { updated_at: draft.serverUpdatedAt, completed_at: null })).toBe(false);
    expect(isSetDraftCurrent({ ...draft, serverUpdatedAt: '' }, { updated_at: draft.serverUpdatedAt, completed_at: null })).toBe(false);
  });
});
