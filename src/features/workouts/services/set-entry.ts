import { lbToKg } from '@/lib/units';

export type SetEntryFields = {
  weight: string;
  reps: string;
  duration: string;
  rpe: string;
  rir: string;
};

export type ParsedSetEntry = {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  rir: number | null;
};

type ParseResult = { values: ParsedSetEntry; error: null } | { values: null; error: string };

function optionalNumber(value: string) {
  const normalized = value.trim().replace(',', '.');
  return normalized ? Number(normalized) : null;
}

export function parseSetEntry(fields: SetEntryFields, imperial: boolean, requirePerformance = false): ParseResult {
  const weight = optionalNumber(fields.weight);
  const reps = optionalNumber(fields.reps);
  const duration = optionalNumber(fields.duration);
  const rpe = optionalNumber(fields.rpe);
  const rir = optionalNumber(fields.rir);

  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) return { values: null, error: 'Enter a valid weight, or leave it blank for bodyweight.' };
  if (reps !== null && (!Number.isInteger(reps) || reps <= 0)) return { values: null, error: 'Reps must be a whole number greater than zero.' };
  if (duration !== null && (!Number.isInteger(duration) || duration <= 0)) return { values: null, error: 'Duration must be a whole number of seconds.' };
  if (rpe !== null && (!Number.isFinite(rpe) || rpe < 1 || rpe > 10)) return { values: null, error: 'RPE must be between 1 and 10.' };
  if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 10)) return { values: null, error: 'RIR must be a whole number between 0 and 10.' };
  if (requirePerformance && reps === null && duration === null) return { values: null, error: 'Enter reps, or add a duration under More details.' };

  return {
    values: {
      weight_kg: weight === null ? null : imperial ? lbToKg(weight) : weight,
      reps,
      duration_seconds: duration,
      rpe,
      rir,
    },
    error: null,
  };
}

export function stepEntry(value: string, amount: number, minimum = 0) {
  const current = optionalNumber(value);
  const next = Math.max(minimum, (current !== null && Number.isFinite(current) ? current : 0) + amount);
  return Number.isInteger(next) ? String(next) : next.toFixed(1).replace(/\.0$/, '');
}
