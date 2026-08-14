export type PendingSetDraft = {
  serverUpdatedAt: string;
  weightKg?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  rpe?: number | null;
  rir?: number | null;
  completedAt?: string | null;
};

export type ServerSetVersion = {
  completed_at: string | null;
  updated_at: string;
};

export function isSetDraftCurrent(draft: PendingSetDraft | undefined, serverSet: ServerSetVersion) {
  return Boolean(draft && !serverSet.completed_at && draft.serverUpdatedAt === serverSet.updated_at);
}
