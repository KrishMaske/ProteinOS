import { z } from 'npm:zod@4.4.3';

import { requireUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { MAX_FILE_BYTES } from '../import-workout-file/limits.ts';
import { renderPdfIllustrationCrops } from '../import-workout-file/pdf-images.ts';

const SOURCE_BUCKET = 'gym-files';
const MEDIA_BUCKET = 'custom-exercise-media';
// Parsing one page and producing up to two native PNG crops stays beneath the
// hosted Edge Runtime CPU budget measured against the largest supported PDF.
const MAX_CROPS_PER_REQUEST = 2;

const cropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
}).strict().refine((crop) => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, {
  message: 'Crop bounds must stay within the source page.',
});

const requestSchema = z.object({
  storagePath: z.string().trim().min(40).max(512),
  importId: z.string().uuid(),
  exercises: z.array(z.object({
    exerciseKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
    pageNumber: z.number().int().min(1).max(10_000),
    imageCrop: cropSchema,
  }).strict()).min(1).max(MAX_CROPS_PER_REQUEST),
}).strict().superRefine((value, context) => {
  if (new Set(value.exercises.map((exercise) => exercise.exerciseKey)).size !== value.exercises.length) {
    context.addIssue({ code: 'custom', path: ['exercises'], message: 'Exercise keys must be unique.' });
  }
  if (new Set(value.exercises.map((exercise) => exercise.pageNumber)).size !== 1) {
    context.addIssue({ code: 'custom', path: ['exercises'], message: 'A crop request must target one PDF page.' });
  }
});

class ImageStageFailure extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function validateSourcePath(path: string, userId: string) {
  const parts = path.split('/');
  const pdfName = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;
  if (parts.length !== 2 || parts[0] !== userId || !pdfName.test(parts[1]) || path.includes('..')) {
    throw new ImageStageFailure('invalid_source_path', 'The private PDF source path could not be verified.', 403);
  }
}

function stagedPath(userId: string, importId: string, exerciseKey: string) {
  // The historical database contract uses a .jpg suffix. The object metadata
  // carries the authoritative image/png MIME type used by clients.
  return `${userId}/staged/${importId}/${exerciseKey}.jpg`;
}

function publicFailure(error: unknown) {
  if (error instanceof ImageStageFailure) return error;
  if (error instanceof z.ZodError) {
    return new ImageStageFailure('invalid_request', 'That source-image request was not valid.');
  }
  const message = error instanceof Error ? error.message : '';
  if (message === 'Unauthorized' || message === 'Missing authorization header') {
    return new ImageStageFailure('unauthorized', 'Your session expired. Please sign in again.', 401);
  }
  return new ImageStageFailure('image_stage_failed', 'Source exercise images could not be prepared.', 500);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const startedAt = performance.now();
  const uploadedPaths: string[] = [];
  let client: any;
  try {
    const auth = await requireUser(request);
    client = auth.client;
    const input = requestSchema.parse(await request.json());
    validateSourcePath(input.storagePath, auth.user.id);

    // Image work is available only for a live, already-persisted review. This
    // prevents direct calls from turning the private media bucket into an
    // untracked user file store.
    const { data: importReview, error: importError } = await client
      .from('routine_imports')
      .select('source_storage_path,status,expires_at')
      .eq('id', input.importId)
      .single();
    if (importError || !importReview || importReview.source_storage_path !== input.storagePath) {
      throw new ImageStageFailure('import_not_found', 'That workout import review could not be verified.', 403);
    }
    if (importReview.status !== 'review' || Date.parse(importReview.expires_at) <= Date.now()) {
      throw new ImageStageFailure('import_not_active', 'That workout import review is no longer active.', 409);
    }
    const requestedKeys = input.exercises.map((exercise) => exercise.exerciseKey);
    const { data: stagedExercises, error: stagedExercisesError } = await client
      .from('routine_import_exercises')
      .select('exercise_key,page_number,source_bbox')
      .eq('import_id', input.importId)
      .in('exercise_key', requestedKeys);
    if (stagedExercisesError || !Array.isArray(stagedExercises)
      || stagedExercises.length !== requestedKeys.length) {
      throw new ImageStageFailure('invalid_exercises', 'Those source illustrations were not part of this review.', 403);
    }
    const persistedByKey = new Map(stagedExercises.map((exercise: any) => [exercise.exercise_key, exercise]));
    for (const exercise of input.exercises) {
      const persisted = persistedByKey.get(exercise.exerciseKey);
      const persistedCrop = cropSchema.safeParse(persisted?.source_bbox);
      if (!persisted || persisted.page_number !== exercise.pageNumber || !persistedCrop.success
        || JSON.stringify(persistedCrop.data) !== JSON.stringify(exercise.imageCrop)) {
        throw new ImageStageFailure('invalid_crop', 'A requested source illustration did not match this review.', 403);
      }
    }

    const { data: sourceFile, error: downloadError } = await client.storage
      .from(SOURCE_BUCKET)
      .download(input.storagePath, {}, { cache: 'no-store' });
    if (downloadError || !sourceFile) {
      throw new ImageStageFailure('source_not_found', 'The private workout PDF could not be read.', 404);
    }
    if (sourceFile.type.split(';', 1)[0].toLowerCase() !== 'application/pdf') {
      throw new ImageStageFailure('invalid_source_type', 'Only PDF source images can be prepared.');
    }
    if (sourceFile.size > MAX_FILE_BYTES) {
      throw new ImageStageFailure('source_too_large', 'Workout PDFs must be 10 MB or smaller.', 413);
    }
    const bytes = new Uint8Array(await sourceFile.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES || bytes.length < 5
      || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44
      || bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
      throw new ImageStageFailure('invalid_pdf', 'The workout source is not a valid supported PDF.');
    }

    const rendered = await renderPdfIllustrationCrops(bytes, input.exercises.map((exercise) => ({
      exerciseKey: exercise.exerciseKey,
      pageNumber: exercise.pageNumber,
      crop: exercise.imageCrop,
    })));
    const images: Array<{ exerciseKey: string; path: string }> = [];
    const failedExerciseKeys = new Set(rendered.failures.keys());
    for (const exercise of input.exercises) {
      const image = rendered.images.get(exercise.exerciseKey);
      if (!image) {
        failedExerciseKeys.add(exercise.exerciseKey);
        continue;
      }
      const path = stagedPath(auth.user.id, input.importId, exercise.exerciseKey);
      const { error } = await client.storage.from(MEDIA_BUCKET).upload(path, image, {
        contentType: 'image/png',
        cacheControl: '31536000',
        upsert: false,
      });
      if (error) {
        failedExerciseKeys.add(exercise.exerciseKey);
        continue;
      }
      uploadedPaths.push(path);
      images.push({ exerciseKey: exercise.exerciseKey, path });
    }

    console.log(JSON.stringify({
      event: 'workout_import_image_stage',
      requested: input.exercises.length,
      staged: images.length,
      elapsed_ms: Math.round(performance.now() - startedAt),
    }));
    return json({ images, failedExerciseKeys: [...failedExerciseKeys] });
  } catch (error) {
    if (client && uploadedPaths.length) await client.storage.from(MEDIA_BUCKET).remove(uploadedPaths);
    const failure = publicFailure(error);
    console.error('Workout import image staging failed', failure.code);
    return json({ error: failure.message }, failure.status);
  }
});
