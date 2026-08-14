import { FunctionsHttpError } from '@supabase/supabase-js';

type ErrorPayload = {
  error?: unknown;
  code?: unknown;
};

function publicMessage(payload: ErrorPayload | null) {
  const message = payload?.error;
  if (typeof message !== 'string') return null;
  const normalized = message.trim();
  if (!normalized || normalized.length > 280) return null;
  return normalized;
}

/**
 * Converts an Edge Function failure into copy that is safe and useful in the UI.
 * Function-owned JSON errors are surfaced; gateway and transport internals are not.
 */
export async function edgeFunctionError(error: unknown, fallback: string) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.clone().json() as ErrorPayload;
      return new Error(publicMessage(payload) ?? fallback);
    } catch {
      return new Error(fallback);
    }
  }

  if (error instanceof Error && error.message && !error.message.includes('Edge Function returned')) {
    return error;
  }
  return new Error(fallback);
}
