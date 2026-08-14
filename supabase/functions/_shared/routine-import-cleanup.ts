import { z } from 'npm:zod@4.4.3';

const cleanupManifestSchema = z.object({
  importId: z.string().uuid(),
  sourceStoragePath: z.string().min(1).max(512),
  stagedImagePaths: z.array(z.string().min(1).max(1_024)).max(1_050),
  retainedImagePaths: z.array(z.string().min(1).max(1_024)).max(1_050),
  cleanupCompleted: z.boolean(),
}).strict();

const MEDIA_BUCKET = 'custom-exercise-media';
const MAX_DISCOVERED_OBJECTS = 1_050;
const LIST_PAGE_SIZE = 1_000;
const REMOVE_BATCH_SIZE = 100;
const stagedImageNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.jpg$/;

const listedObjectSchema = z.object({
  name: z.string().min(1).max(1_024),
}).passthrough();

export class RoutineImportCleanupError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function validateSourcePath(path: string, userId: string) {
  const parts = path.split('/');
  if (parts.length !== 2 || parts[0] !== userId || !parts[1]) {
    throw new RoutineImportCleanupError('invalid_source_path', 'The import source path could not be verified.', 403);
  }
}

function validateStagedPath(path: string, userId: string, importId: string) {
  const expectedPrefix = `${userId}/staged/${importId}/`;
  if (!path.startsWith(expectedPrefix) || !stagedImageNamePattern.test(path.slice(expectedPrefix.length))) {
    throw new RoutineImportCleanupError('invalid_staged_path', 'An import image path could not be verified.', 403);
  }
}

async function listDiscoveredStagedPaths(client: any, userId: string, importId: string) {
  const prefix = `${userId}/staged/${importId}`;
  const listedObjects: z.infer<typeof listedObjectSchema>[] = [];

  while (listedObjects.length <= MAX_DISCOVERED_OBJECTS) {
    const limit = Math.min(LIST_PAGE_SIZE, (MAX_DISCOVERED_OBJECTS + 1) - listedObjects.length);
    const { data, error } = await client.storage.from(MEDIA_BUCKET).list(prefix, {
      limit,
      offset: listedObjects.length,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Staged image listing was not returned');

    const page = z.array(listedObjectSchema).max(limit).parse(data);
    listedObjects.push(...page);
    if (listedObjects.length > MAX_DISCOVERED_OBJECTS) {
      throw new RoutineImportCleanupError(
        'too_many_staged_objects',
        'The import contains too many staged image objects to clean safely.',
        409,
      );
    }
    if (page.length < limit) break;
  }

  const paths: string[] = [];
  for (const object of listedObjects) {
    if (!object.name.endsWith('.jpg')) continue;
    if (!stagedImageNamePattern.test(object.name)) {
      throw new RoutineImportCleanupError(
        'invalid_discovered_staged_path',
        'A discovered import image path could not be verified.',
        403,
      );
    }
    paths.push(`${prefix}/${object.name}`);
  }
  return paths;
}

async function removeInBatches(client: any, bucket: string, paths: string[]) {
  for (let offset = 0; offset < paths.length; offset += REMOVE_BATCH_SIZE) {
    const result = await client.storage.from(bucket).remove(paths.slice(offset, offset + REMOVE_BATCH_SIZE));
    if (result.error) throw result.error;
  }
}

export async function cleanupRoutineImport(client: any, userId: string, importId: string) {
  const { data, error } = await client.rpc('get_routine_import_cleanup_manifest', {
    target_import_id: importId,
  });
  if (error || !data) throw error ?? new Error('Cleanup manifest was not returned');
  const manifest = cleanupManifestSchema.parse(data);
  if (manifest.importId !== importId) {
    throw new RoutineImportCleanupError('manifest_mismatch', 'The cleanup manifest did not match this import.', 409);
  }
  if (manifest.cleanupCompleted) {
    return {
      importId,
      alreadyCleaned: true,
      removedSourceFile: false,
      removedStagedImages: 0,
      retainedImages: manifest.retainedImagePaths.length,
    };
  }
  validateSourcePath(manifest.sourceStoragePath, userId);
  for (const path of manifest.stagedImagePaths) validateStagedPath(path, userId, importId);
  for (const path of manifest.retainedImagePaths) validateStagedPath(path, userId, importId);

  const discoveredPaths = await listDiscoveredStagedPaths(client, userId, importId);
  const staged = new Set([...manifest.stagedImagePaths, ...discoveredPaths]);
  if (manifest.retainedImagePaths.some((path) => !staged.has(path))) {
    throw new RoutineImportCleanupError('invalid_retained_path', 'The cleanup manifest contained an invalid retained image.', 409);
  }
  const retained = new Set(manifest.retainedImagePaths);
  const disposableImages = [...staged].filter((path) => !retained.has(path)).sort();

  await removeInBatches(client, MEDIA_BUCKET, disposableImages);
  await removeInBatches(client, 'gym-files', [manifest.sourceStoragePath]);

  const { data: cleanedImport, error: markError } = await client.rpc('mark_routine_import_cleanup_complete', {
    target_import_id: importId,
  });
  if (markError || !cleanedImport) throw markError ?? new Error('Cleanup was not marked complete');
  return {
    importId,
    alreadyCleaned: false,
    removedSourceFile: true,
    removedStagedImages: disposableImages.length,
    retainedImages: retained.size,
  };
}

export async function cleanupExpiredRoutineImports(client: any, userId: string, limit = 3) {
  const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const { data, error } = await client.rpc('list_expired_routine_import_cleanup_ids', {
    target_limit: boundedLimit,
  });
  if (error) throw error;
  const ids = z.array(z.object({ import_id: z.string().uuid() })).max(boundedLimit).parse(data ?? []);
  const results = await Promise.allSettled(ids.map(({ import_id: importId }) => cleanupRoutineImport(client, userId, importId)));
  return {
    attempted: ids.length,
    cleaned: results.filter((result) => result.status === 'fulfilled').length,
  };
}
