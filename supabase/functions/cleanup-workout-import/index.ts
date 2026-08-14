import { z } from 'npm:zod@4.4.3';

import { requireUser } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import {
  cleanupRoutineImport,
  RoutineImportCleanupError,
} from '../_shared/routine-import-cleanup.ts';

const requestSchema = z.object({ importId: z.string().uuid() }).strict();

function publicFailure(error: unknown) {
  if (error instanceof RoutineImportCleanupError) return error;
  if (error instanceof z.ZodError) return new RoutineImportCleanupError('invalid_request', 'That cleanup request was not valid.');
  const message = error instanceof Error ? error.message : '';
  if (message === 'Unauthorized' || message === 'Missing authorization header') {
    return new RoutineImportCleanupError('unauthorized', 'Your session expired. Please sign in again.', 401);
  }
  return new RoutineImportCleanupError('cleanup_failed', 'The import was saved, but its temporary files could not be cleaned up yet.', 500);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await requireUser(request);
    const { importId } = requestSchema.parse(await request.json());
    const cleaned = await cleanupRoutineImport(auth.client, auth.user.id, importId);
    return json({ cleaned: true, ...cleaned });
  } catch (error) {
    const failure = publicFailure(error);
    console.error('Workout import cleanup failed', failure.code);
    return json({ error: failure.message }, failure.status);
  }
});
