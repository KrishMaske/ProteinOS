import { describe, expect, it, vi } from 'vitest';

import { cleanupRoutineImport } from '../supabase/functions/_shared/routine-import-cleanup';

const userId = '11111111-1111-4111-8111-111111111111';
const importId = '22222222-2222-4222-8222-222222222222';
const sourceStoragePath = `${userId}/33333333-3333-4333-8333-333333333333.pdf`;
const prefix = `${userId}/staged/${importId}`;

function pathFor(key: string) {
  return `${prefix}/${key}.jpg`;
}

function createClient(options: {
  cleanupCompleted?: boolean;
  listed?: { name: string }[];
  listError?: Error;
  mediaRemoveError?: Error;
} = {}) {
  const manifest = {
    importId,
    sourceStoragePath,
    stagedImagePaths: [pathFor('exercise-001'), pathFor('exercise-002')],
    retainedImagePaths: [pathFor('exercise-002')],
    cleanupCompleted: options.cleanupCompleted ?? false,
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_routine_import_cleanup_manifest') return { data: manifest, error: null };
    if (name === 'mark_routine_import_cleanup_complete') return { data: { id: importId }, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const listed = options.listed
    ?? [{ name: 'exercise-001.jpg' }, { name: 'exercise-002.jpg' }, { name: 'orphan-003.jpg' }];
  const list = vi.fn(async (_prefix: string, query: { limit: number; offset: number }) => ({
    data: listed.slice(query.offset, query.offset + query.limit),
    error: options.listError ?? null,
  }));
  const mediaRemove = vi.fn(async () => ({ data: [], error: options.mediaRemoveError ?? null }));
  const sourceRemove = vi.fn(async () => ({ data: [], error: null }));
  const from = vi.fn((bucket: string) => {
    if (bucket === 'custom-exercise-media') return { list, remove: mediaRemove };
    if (bucket === 'gym-files') return { remove: sourceRemove };
    throw new Error(`Unexpected bucket: ${bucket}`);
  });
  return {
    client: { rpc, storage: { from } },
    list,
    mediaRemove,
    sourceRemove,
    rpc,
  };
}

describe('routine import storage cleanup', () => {
  it('unions discovered orphan JPGs with the manifest and preserves retained images', async () => {
    const fake = createClient();

    await expect(cleanupRoutineImport(fake.client, userId, importId)).resolves.toEqual({
      importId,
      alreadyCleaned: false,
      removedSourceFile: true,
      removedStagedImages: 2,
      retainedImages: 1,
    });
    expect(fake.list).toHaveBeenCalledWith(prefix, {
      limit: 1_000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(fake.mediaRemove).toHaveBeenCalledWith([pathFor('exercise-001'), pathFor('orphan-003')]);
    expect(fake.sourceRemove).toHaveBeenCalledWith([sourceStoragePath]);
    expect(fake.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_routine_import_cleanup_manifest',
      'mark_routine_import_cleanup_complete',
    ]);
  });

  it('does not remove files or mark cleanup complete when the prefix listing fails', async () => {
    const failure = new Error('list failed');
    const fake = createClient({ listError: failure });

    await expect(cleanupRoutineImport(fake.client, userId, importId)).rejects.toBe(failure);
    expect(fake.mediaRemove).not.toHaveBeenCalled();
    expect(fake.sourceRemove).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('does not remove the source or mark cleanup complete when image removal fails', async () => {
    const failure = new Error('remove failed');
    const fake = createClient({ mediaRemoveError: failure });

    await expect(cleanupRoutineImport(fake.client, userId, importId)).rejects.toBe(failure);
    expect(fake.sourceRemove).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('remains idempotent after a manifest has already been marked clean', async () => {
    const fake = createClient({ cleanupCompleted: true });

    await expect(cleanupRoutineImport(fake.client, userId, importId)).resolves.toMatchObject({
      alreadyCleaned: true,
      removedSourceFile: false,
      removedStagedImages: 0,
    });
    expect(fake.list).not.toHaveBeenCalled();
    expect(fake.mediaRemove).not.toHaveBeenCalled();
    expect(fake.sourceRemove).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('bounds prefix discovery and refuses to mark an oversized cleanup complete', async () => {
    const fake = createClient({
      listed: Array.from({ length: 1_051 }, (_, index) => ({ name: `orphan-${index}.jpg` })),
    });

    await expect(cleanupRoutineImport(fake.client, userId, importId)).rejects.toMatchObject({
      code: 'too_many_staged_objects',
    });
    expect(fake.list).toHaveBeenCalledTimes(2);
    expect(fake.mediaRemove).not.toHaveBeenCalled();
    expect(fake.sourceRemove).not.toHaveBeenCalled();
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });

  it('removes discovered images in bounded batches', async () => {
    const fake = createClient({
      listed: Array.from({ length: 205 }, (_, index) => ({ name: `orphan-${index}.jpg` })),
    });

    await cleanupRoutineImport(fake.client, userId, importId);

    expect(fake.mediaRemove).toHaveBeenCalledTimes(3);
    expect(fake.mediaRemove.mock.calls.map(([paths]) => paths.length)).toEqual([100, 100, 6]);
    expect(fake.rpc.mock.calls.at(-1)?.[0]).toBe('mark_routine_import_cleanup_complete');
  });
});
