export type PerformanceSet = {
  reps: number | null;
  weightKg: number | null;
  rir: number | null;
  rpe: number | null;
  completed: boolean;
  type: 'warmup' | 'working' | 'failure' | 'drop';
};

export type LoadGuidanceAction = 'increase_load' | 'maintain_load' | 'reduce_load' | 'insufficient_data';

export type OverloadRecommendation = {
  action: LoadGuidanceAction;
  suggestedChangePercent: number | null;
  reason: string;
};

type RepRange = { min: number; max: number };

function workingSets(sets: PerformanceSet[]) {
  return sets.filter((set) => set.completed && set.type === 'working' && set.reps !== null);
}

function effortIsAtOrEasierThanTarget(set: PerformanceSet, targetRir: number | null, targetRpe: number | null) {
  if (targetRir !== null && set.rir !== null) return set.rir >= targetRir;
  if (targetRpe !== null && set.rpe !== null) return set.rpe <= targetRpe;
  return null;
}

function effortIsMeaningfullyHarderThanTarget(set: PerformanceSet, targetRir: number | null, targetRpe: number | null) {
  if (targetRir !== null && set.rir !== null) return set.rir < targetRir;
  if (targetRpe !== null && set.rpe !== null) return set.rpe > targetRpe;
  return false;
}

function range(repMin: number | null, repMax: number | null): RepRange | null {
  if (repMin === null && repMax === null) return null;
  const min = repMin ?? repMax;
  const max = repMax ?? repMin;
  if (min === null || max === null) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

/**
 * Produces descriptive double-progression guidance; it never changes a logged or planned load.
 * Only completed, regular working sets count. Warm-ups, drop sets and intentional failure sets
 * describe a different stimulus and would otherwise skew the signal.
 */
export function recommendProgressiveOverload(
  sets: PerformanceSet[],
  repMin: number | null,
  repMax: number | null,
  targetRir: number | null,
  targetRpe: number | null,
  expectedWorkingSets?: number | null,
): OverloadRecommendation {
  const target = range(repMin, repMax);
  const working = workingSets(sets);
  if (!target || !working.length) {
    return { action: 'insufficient_data', suggestedChangePercent: null, reason: 'Complete the planned working sets to get load guidance.' };
  }

  if (expectedWorkingSets && working.length < expectedWorkingSets) {
    return { action: 'insufficient_data', suggestedChangePercent: null, reason: `Complete all ${expectedWorkingSets} planned working sets before changing the load.` };
  }

  const allMeetTop = working.every((set) => (set.reps ?? 0) >= target.max);
  const bodyweightOnly = working.every((set) => set.weightKg === null);
  const recordedEffort = working.map((set) => effortIsAtOrEasierThanTarget(set, targetRir, targetRpe));
  const hasEffortTarget = targetRir !== null || targetRpe !== null;
  const effortSupportsIncrease = !hasEffortTarget || recordedEffort.every((value) => value === true);
  if (allMeetTop && effortSupportsIncrease) {
    const effortPhrase = hasEffortTarget ? ' at or below the planned effort' : '';
    return {
      action: 'increase_load',
      suggestedChangePercent: bodyweightOnly ? null : 2.5,
      reason: bodyweightOnly
        ? `All working sets reached ${target.max} reps${effortPhrase}. Consider a harder variation or a small external load.`
        : `All working sets reached ${target.max} reps${effortPhrase}. A conservative next step is about 2.5% more.`,
    };
  }

  const belowMinimum = working.filter((set) => (set.reps ?? 0) < target.min);
  const hardBelowMinimum = belowMinimum.filter((set) => effortIsMeaningfullyHarderThanTarget(set, targetRir, targetRpe));
  const majorityBelowMinimum = belowMinimum.length > working.length / 2;
  const reductionHasEvidence = majorityBelowMinimum && (!hasEffortTarget || hardBelowMinimum.length > working.length / 2);
  if (reductionHasEvidence) {
    const effortPhrase = hardBelowMinimum.length ? ' at a harder effort than planned' : '';
    return {
      action: 'reduce_load',
      suggestedChangePercent: bodyweightOnly ? null : -5,
      reason: bodyweightOnly
        ? `Most working sets fell below ${target.min} reps${effortPhrase}. Use more assistance or an easier variation and rebuild.`
        : `Most working sets fell below ${target.min} reps${effortPhrase}. A conservative reset is about 5% less.`,
    };
  }

  if (allMeetTop && hasEffortTarget && recordedEffort.some((value) => value === null)) {
    return {
      action: 'maintain_load',
      suggestedChangePercent: null,
      reason: `You reached ${target.max} reps, but effort was not recorded on every working set. Hold the load and confirm it once more.`,
    };
  }

  return {
    action: 'maintain_load',
    suggestedChangePercent: null,
    reason: `Keep this load until every working set reaches ${target.max} reps at the planned effort.`,
  };
}
