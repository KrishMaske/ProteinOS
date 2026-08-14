import { FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { edgeFunctionError } from './edge-function-error';

describe('edgeFunctionError', () => {
  it('surfaces a function-owned public error', async () => {
    const response = new Response(JSON.stringify({ error: 'Try a clearer photo.' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(edgeFunctionError(new FunctionsHttpError(response), 'Analysis failed.'))
      .resolves.toEqual(new Error('Try a clearer photo.'));
  });

  it('uses the fallback for an invalid or oversized response', async () => {
    const response = new Response(JSON.stringify({ error: 'x'.repeat(400) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(edgeFunctionError(new FunctionsHttpError(response), 'Analysis failed.'))
      .resolves.toEqual(new Error('Analysis failed.'));
  });

  it('preserves a useful local error', async () => {
    const original = new Error('The selected photo could not be read.');
    await expect(edgeFunctionError(original, 'Analysis failed.')).resolves.toBe(original);
  });
});
