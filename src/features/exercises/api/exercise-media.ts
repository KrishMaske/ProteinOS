import type { ExerciseSummary } from '@/features/exercises/exercise-reference';
import { supabase } from '@/lib/supabase/client';

const MEDIA_BUCKET = 'custom-exercise-media';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Custom exercises keep their media in a private bucket, so each path needs a signed URL. */
export async function signedMediaByPath(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!unique.length) return new Map<string, string>();
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
}

/** Fills `image_source` for rows whose media lives behind `media_path` (catalog rows already carry public URLs). */
export async function withResolvedExerciseMedia<T extends { exercise: ExerciseSummary }>(items: T[]): Promise<T[]> {
  const signed = await signedMediaByPath(items.map((item) => item.exercise.media_path));
  if (!signed.size) return items;
  return items.map((item) => {
    const { image_source, media_path } = item.exercise;
    if (image_source || !media_path) return item;
    return { ...item, exercise: { ...item.exercise, image_source: signed.get(media_path) ?? null } };
  });
}
