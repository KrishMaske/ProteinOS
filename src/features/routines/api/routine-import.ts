import { FunctionsHttpError } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import {
  RoutineImportAnalysisSchema,
  RoutineImportConfirmationSchema,
  StoredRoutineImportReviewSchema,
  type RoutineImportCandidate,
  type RoutineImportChoice,
  type StoredRoutineImportReview,
} from '@/lib/openai-types/routine-import';
import { supabase } from '@/lib/supabase/client';
import { uuid } from '@/lib/uuid';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const reviewStorageKey = (userId: string) => `routine-import-review:${userId}`;
const extensionMimeTypes: Record<string, string> = {
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  json: 'application/json',
  md: 'text/markdown',
  pdf: 'application/pdf',
  rtf: 'application/rtf',
  txt: 'text/plain',
  tsv: 'text/tab-separated-values',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function fileExtension(name: string) {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension && extensionMimeTypes[extension] ? extension : null;
}

async function functionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Fall back to the SDK message when an error response has no JSON body.
    }
  }
  return error instanceof Error ? error.message : 'Coach could not analyze this file.';
}

export async function pickAndAnalyzeRoutine(userId: string) {
  const selection = await DocumentPicker.getDocumentAsync({
    type: Object.values(extensionMimeTypes),
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) return null;

  const asset = selection.assets[0];
  const extension = fileExtension(asset.name);
  if (!extension) throw new Error('Choose a PDF, Word, text, CSV, or Excel workout file.');
  if (asset.size && asset.size > MAX_FILE_BYTES) throw new Error('Workout files must be 10 MB or smaller.');

  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('The selected file could not be read.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('Workout files must be 10 MB or smaller.');

  const mimeType = extensionMimeTypes[extension];
  const storagePath = `${userId}/${uuid()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('gym-files').upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  try {
    const { data, error } = await supabase.functions.invoke('import-workout-file', {
      body: { storagePath, originalName: asset.name, mimeType },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    return RoutineImportAnalysisSchema.parse(data);
  } catch (error) {
    await supabase.storage.from('gym-files').remove([storagePath]);
    throw error;
  }
}

export async function saveRoutineImportReview(userId: string, review: StoredRoutineImportReview) {
  const validated = StoredRoutineImportReviewSchema.parse(review);
  await AsyncStorage.setItem(reviewStorageKey(userId), JSON.stringify(validated));
  return validated;
}

export async function loadRoutineImportReview(userId: string) {
  const stored = await AsyncStorage.getItem(reviewStorageKey(userId));
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    const currentReview = StoredRoutineImportReviewSchema.safeParse(value);
    if (currentReview.success && new Date(currentReview.data.analysis.expiresAt).getTime() > Date.now()) {
      return currentReview.data;
    }

    // Reviews saved before progress persistence shipped still resume safely.
    const legacyAnalysis = RoutineImportAnalysisSchema.safeParse(value);
    if (legacyAnalysis.success && new Date(legacyAnalysis.data.expiresAt).getTime() > Date.now()) {
      return {
        version: 2 as const,
        analysis: legacyAnalysis.data,
        selections: {},
        reviewedExerciseKeys: [],
        activeExerciseKey: null,
      };
    }
  } catch {
    // Remove malformed or obsolete local review state below.
  }
  await AsyncStorage.removeItem(reviewStorageKey(userId));
  return null;
}

export async function clearRoutineImportReview(userId: string) {
  await AsyncStorage.removeItem(reviewStorageKey(userId));
}

export async function confirmRoutineImport(importId: string, resolutions: RoutineImportChoice[]) {
  const { data, error } = await supabase.rpc('confirm_routine_import' as never, {
    target_import_id: importId,
    target_resolutions: resolutions,
  } as never);
  if (error) throw error;
  const routine = data as unknown as Record<string, unknown> | null;
  const confirmation = RoutineImportConfirmationSchema.parse({ routineId: routine?.id, routineName: routine?.name });
  await cleanupRoutineImport(importId);
  return confirmation;
}

async function cleanupRoutineImport(importId: string) {
  try {
    await supabase.functions.invoke('cleanup-workout-import', { body: { importId } });
  } catch {
    // Confirmation is already committed. Expired imports are retried by the
    // server-side cleanup sweep, so temporary-file cleanup never hides success.
  }
}

export async function cancelRoutineImport(importId: string) {
  const { error } = await supabase.rpc('cancel_routine_import' as never, { target_import_id: importId } as never);
  if (error) throw error;
  await cleanupRoutineImport(importId);
}

export async function getCatalogCandidateMedia(candidates: RoutineImportCandidate[]) {
  const missing = candidates.filter((candidate) => !candidate.imageSource && !candidate.gifSource).map((candidate) => candidate.exerciseId);
  if (!missing.length) return candidates;
  const { data, error } = await supabase.from('exercise_catalog').select('id,image_source,gif_source').in('id', [...new Set(missing)]);
  if (error) throw error;
  const media = new Map((data ?? []).map((row) => [row.id, row]));
  return candidates.map((candidate) => ({
    ...candidate,
    imageSource: candidate.imageSource ?? media.get(candidate.exerciseId)?.image_source ?? null,
    gifSource: candidate.gifSource ?? media.get(candidate.exerciseId)?.gif_source ?? null,
  }));
}

export async function createStagedImageUrl(path: string) {
  const { data, error } = await supabase.storage.from('custom-exercise-media').createSignedUrl(path, 15 * 60);
  if (error) throw error;
  return data.signedUrl;
}
