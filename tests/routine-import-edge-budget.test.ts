import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const importer = readFileSync(
  new URL('../supabase/functions/import-workout-file/index.ts', import.meta.url),
  'utf8',
);
const imageWorker = readFileSync(
  new URL('../supabase/functions/stage-workout-import-images/index.ts', import.meta.url),
  'utf8',
);

describe('workout import Edge CPU contract', () => {
  it('passes private source files to OpenAI by temporary file ID without Base64 copies', () => {
    expect(importer).toContain('openAIFileId = await uploadOpenAIFile(sourceFile, sourceFileName)');
    expect(importer).toContain('file_id: openAIFileId');
    expect(importer).toContain('await deleteOpenAIFile(openAIFileId)');
    expect(importer).not.toMatch(/createSignedUrl|signedSource|file_url:/);
    expect(importer).not.toMatch(/file_data|bytesToBase64|\bbtoa\s*\(/);
  });

  it('uses only prevalidated catalog image URLs in the semantic request', () => {
    expect(importer).toContain("url.hostname === 'raw.githubusercontent.com'");
    expect(importer).toContain("type: 'input_image', image_url: imageUrl");
    expect(importer).not.toMatch(/fetchCatalog|candidateImageBytes|imageBase64/);
  });

  it('limits each image worker invocation to two crops from one page', () => {
    expect(importer).toContain('const MAX_CROPS_PER_WORKER_REQUEST = 2;');
    expect(imageWorker).toContain('const MAX_CROPS_PER_REQUEST = 2;');
    expect(imageWorker).toContain("message: 'A crop request must target one PDF page.'");
    expect(imageWorker).toContain("contentType: 'image/png'");
    expect(imageWorker).toContain(".from('routine_imports')");
    expect(imageWorker).toContain("importReview.source_storage_path !== input.storagePath");
    expect(imageWorker).toContain(".from('routine_import_exercises')");
    expect(imageWorker).toContain("persisted.page_number !== exercise.pageNumber");
  });
});
