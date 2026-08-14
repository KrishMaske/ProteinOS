type Metric = { measured_at: string; weight_kg: number | null; waist_cm: number | null };

export type RecompositionSummary = {
  title: string;
  detail: string;
  kind: 'positive' | 'neutral' | 'insufficient';
};

export function summarizeRecomposition(metrics: Metric[], context?: { workoutWeeks?: number[]; strengthValues?: number[]; proteinAdherencePercent?: number | null }): RecompositionSummary {
  if (metrics.length < 2) {
    return { title: 'More data needed', detail: 'Log at least two measurements to interpret a trend.', kind: 'insufficient' };
  }
  const ordered = [...metrics].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const weightChange = first.weight_kg && last.weight_kg ? ((last.weight_kg - first.weight_kg) / first.weight_kg) * 100 : null;
  const waistChange = first.waist_cm && last.waist_cm ? last.waist_cm - first.waist_cm : null;

  if (weightChange !== null && waistChange !== null && Math.abs(weightChange) <= 2 && waistChange <= -1) {
    const support = context?.strengthValues && context.strengthValues.length > 1 && context.strengthValues.at(-1)! >= context.strengthValues[0] ? ' Strength is stable or improving.' : '';
    return { title: 'Recomposition signal', detail: `Weight is broadly stable (${weightChange.toFixed(1)}%) while waist is down ${Math.abs(waistChange).toFixed(1)} cm.${support} Keep watching the multi-week trend.`, kind: 'positive' };
  }
  if (weightChange !== null && weightChange <= -1) {
    return { title: 'Weight trending down', detail: `Weight changed ${weightChange.toFixed(1)}% across this range. Use waist and training performance for context.`, kind: 'neutral' };
  }
  if (weightChange !== null && weightChange >= 1) {
    return { title: 'Weight trending up', detail: `Weight changed +${weightChange.toFixed(1)}% across this range. Compare this with waist and training performance.`, kind: 'neutral' };
  }
  return { title: 'Trend is broadly stable', detail: 'Current measurements do not show a strong directional change yet.', kind: 'neutral' };
}
