import { z } from 'zod';

const sourceInstructionsSchema = z.union([
  z.string(),
  z.object({ en: z.string().optional(), tr: z.string().optional() }).passthrough(),
]);

export const sourceExerciseSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().trim().min(1),
  category: z.string().nullish(),
  body_part: z.string().nullish(),
  equipment: z.string().nullish(),
  target: z.string().nullish(),
  muscle_group: z.string().nullish(),
  secondary_muscles: z.array(z.string()).nullish(),
  instructions: sourceInstructionsSchema.nullish(),
  instruction_steps: z.union([
    z.array(z.string()),
    z.object({ en: z.array(z.string()).optional() }).passthrough(),
  ]).nullish(),
  image: z.string().nullish(),
  gif_url: z.string().nullish(),
  media_id: z.string().nullish(),
  attribution: z.union([z.string(), z.record(z.string(), z.unknown())]).nullish(),
}).passthrough();

export const normalizedExerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().nullable(),
  body_part: z.string().nullable(),
  equipment: z.string().nullable(),
  target: z.string().nullable(),
  muscle_group: z.string().nullable(),
  secondary_muscles: z.array(z.string()),
  instructions: z.string().nullable(),
  instruction_steps: z.array(z.string()),
  image_source: z.url().nullable(),
  gif_source: z.url().nullable(),
  media_id: z.string().nullable(),
  attribution: z.record(z.string(), z.unknown()),
  source_version: z.string().min(7),
});

type SourceExercise = z.infer<typeof sourceExerciseSchema>;
export type NormalizedExercise = z.infer<typeof normalizedExerciseSchema>;

export function normalizeExercise(input: unknown, sourceVersion: string): NormalizedExercise {
  const source = sourceExerciseSchema.parse(input);
  const instructions = getEnglishInstructions(source.instructions);
  const normalized = {
    id: source.id,
    name: source.name,
    category: clean(source.category),
    body_part: clean(source.body_part ?? source.category),
    equipment: clean(source.equipment),
    target: clean(source.target),
    muscle_group: clean(source.muscle_group),
    secondary_muscles: [...new Set((source.secondary_muscles ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))],
    instructions,
    instruction_steps: getEnglishSteps(source.instruction_steps) ?? toSteps(instructions),
    image_source: mediaUrl(source.image, sourceVersion),
    gif_source: mediaUrl(source.gif_url, sourceVersion),
    media_id: source.media_id ?? mediaId(source.image ?? source.gif_url),
    attribution: normalizeAttribution(source.attribution),
    source_version: sourceVersion,
  };
  return normalizedExerciseSchema.parse(normalized);
}

function getEnglishInstructions(value: SourceExercise['instructions']) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value.en?.trim() || null;
}

function clean(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function toSteps(value: string | null) {
  if (!value) return [];
  return value.split(/(?<=[.!?])\s+/).map((step) => step.trim()).filter(Boolean);
}

function getEnglishSteps(value: SourceExercise['instruction_steps']) {
  if (!value) return null;
  const steps = Array.isArray(value) ? value : value.en;
  return steps?.map((step) => step.trim()).filter(Boolean) ?? null;
}

function mediaUrl(path: string | null | undefined, version: string) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/${version}/${path.replace(/^\.\//, '')}`;
}

function mediaId(path?: string | null) {
  if (!path) return null;
  return path.split('/').at(-1)?.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '') ?? null;
}

function normalizeAttribution(value: SourceExercise['attribution']): Record<string, unknown> {
  if (value && typeof value === 'object') return value;
  return {
    dataset: 'hasaneyldrm/exercises-dataset',
    datasetLicense: 'MIT',
    mediaCopyright: '© Gym visual — https://gymvisual.com/',
    mediaTerms: 'https://github.com/hasaneyldrm/exercises-dataset/blob/main/NOTICE.md',
    sourceAttribution: value ?? null,
  };
}
