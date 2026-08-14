const OPENAI_API_URL = 'https://api.openai.com/v1';
const OPENAI_RESPONSES_URL = `${OPENAI_API_URL}/responses`;
const OPENAI_FILES_URL = `${OPENAI_API_URL}/files`;

export type OpenAIAPIStage = 'responses' | 'file_upload' | 'file_delete';

type OpenAIAPIErrorInit = {
  status: number | null;
  code?: unknown;
  type?: unknown;
  param?: unknown;
  requestId?: unknown;
  stage: OpenAIAPIStage;
};

export type OpenAIErrorDetails = Readonly<{
  status: number | null;
  code: string | null;
  type: string | null;
  param: string | null;
  requestId: string | null;
  stage: OpenAIAPIStage;
}>;

function safeIdentifier(value: unknown, maxLength = 160) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength) return null;
  return /^[A-Za-z0-9_.\[\]-]+$/.test(value) ? value : null;
}

/**
 * An OpenAI request failure containing only metadata that is safe to log or persist.
 * The upstream response body and error message are deliberately not retained.
 */
export class OpenAIAPIError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly type: string | null;
  readonly param: string | null;
  readonly requestId: string | null;
  readonly stage: OpenAIAPIStage;

  constructor(init: OpenAIAPIErrorInit) {
    const code = safeIdentifier(init.code);
    const statusLabel = init.status === null ? code ?? 'transport_error' : String(init.status);
    super(`OpenAI ${init.stage} request failed (${statusLabel})`);
    this.name = 'OpenAIAPIError';
    this.status = init.status;
    this.code = code;
    this.type = safeIdentifier(init.type);
    this.param = safeIdentifier(init.param);
    this.requestId = safeIdentifier(init.requestId);
    this.stage = init.stage;
  }
}

export function openAIErrorDetails(error: unknown): OpenAIErrorDetails | null {
  if (!(error instanceof OpenAIAPIError)) return null;
  return Object.freeze({
    status: error.status,
    code: error.code,
    type: error.type,
    param: error.param,
    requestId: error.requestId,
    stage: error.stage,
  });
}

function apiKey() {
  const value = Deno.env.get('OPENAI_API_KEY');
  if (!value) throw new Error('OPENAI_API_KEY is not configured');
  return value;
}

function transportError(error: unknown, stage: OpenAIAPIStage) {
  const name = error instanceof Error ? error.name : '';
  const code = name === 'TimeoutError'
    ? 'request_timeout'
    : name === 'AbortError'
    ? 'request_aborted'
    : 'request_failed';
  return new OpenAIAPIError({
    status: null,
    code,
    type: 'transport_error',
    stage,
  });
}

async function openAIFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  stage: OpenAIAPIStage,
) {
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${apiKey()}`);
    return await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof OpenAIAPIError || (error instanceof Error && error.message.includes('OPENAI_API_KEY'))) {
      throw error;
    }
    throw transportError(error, stage);
  }
}

async function responsePayload(response: Response) {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, any>
      : null;
  } catch {
    return null;
  }
}

function responseError(
  response: Response,
  payload: Record<string, any> | null,
  stage: OpenAIAPIStage,
) {
  return new OpenAIAPIError({
    status: response.status,
    code: payload?.error?.code,
    type: payload?.error?.type,
    param: payload?.error?.param,
    requestId: response.headers.get('x-request-id'),
    stage,
  });
}

function invalidResponseError(stage: OpenAIAPIStage, requestId: string | null) {
  return new OpenAIAPIError({
    status: 502,
    code: 'invalid_api_response',
    type: 'invalid_response',
    requestId,
    stage,
  });
}

function uploadFilename(filename: string) {
  const value = filename.trim();
  if (!value || value.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('OpenAI upload filename is not valid');
  }
  return value;
}

function isOpenAIFileId(value: unknown): value is string {
  return typeof value === 'string' && /^file-[A-Za-z0-9_-]{1,500}$/.test(value);
}

/**
 * Default model per workload.
 *
 * Coach and routine import run on the cheap tier because both sit behind a human review
 * step that surfaces a bad answer before it is committed. Food analysis stays on the
 * stronger tier because a misidentified meal looks plausible, is accepted without
 * question, and then propagates into daily totals, weekly averages, body composition,
 * and recalculated calorie targets.
 */
const DEFAULT_MODEL_BY_VARIABLE: Record<string, string> = {
  OPENAI_MODEL: 'gpt-5.6-luna',
  OPENAI_IMPORT_MODEL: 'gpt-5.6-luna',
  OPENAI_VISION_MODEL: 'gpt-5.6-terra',
};

const LAST_RESORT_MODEL = 'gpt-5.6-terra';

/**
 * Each workload reads its own variable and falls back to its own default. A generic
 * OPENAI_MODEL is deliberately consulted *after* the per-workload default, so setting it
 * cannot silently drag vision onto a cheaper model.
 */
export function openAIModel(variable = 'OPENAI_MODEL') {
  return Deno.env.get(variable)
    ?? DEFAULT_MODEL_BY_VARIABLE[variable]
    ?? Deno.env.get('OPENAI_MODEL')
    ?? LAST_RESORT_MODEL;
}

export async function createResponse(body: Record<string, unknown>, timeoutMs = 45_000) {
  const response = await openAIFetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs, 'responses');

  const payload = await responsePayload(response);
  if (!response.ok) throw responseError(response, payload, 'responses');
  if (!payload) throw invalidResponseError('responses', response.headers.get('x-request-id'));
  return payload;
}

/** Uploads a Blob without Base64 conversion and returns a validated Files API ID. */
export async function uploadOpenAIFile(file: Blob, filename: string, timeoutMs = 45_000) {
  if (!(file instanceof Blob) || file.size < 1) throw new Error('OpenAI upload file is empty');

  const form = new FormData();
  form.set('purpose', 'user_data');
  form.set('expires_after[anchor]', 'created_at');
  form.set('expires_after[seconds]', '3600');
  form.set('file', file, uploadFilename(filename));

  const response = await openAIFetch(OPENAI_FILES_URL, {
    method: 'POST',
    body: form,
  }, timeoutMs, 'file_upload');
  const payload = await responsePayload(response);
  if (!response.ok) throw responseError(response, payload, 'file_upload');
  if (!isOpenAIFileId(payload?.id)) {
    throw invalidResponseError('file_upload', response.headers.get('x-request-id'));
  }
  return payload.id;
}

/** Deletes a temporary Files API object. A missing file is already considered deleted. */
export async function deleteOpenAIFile(fileId: string, timeoutMs = 15_000): Promise<void> {
  if (!isOpenAIFileId(fileId)) throw new Error('OpenAI file id is not valid');

  const response = await openAIFetch(`${OPENAI_FILES_URL}/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  }, timeoutMs, 'file_delete');
  if (response.ok || response.status === 404) return;

  const payload = await responsePayload(response);
  throw responseError(response, payload, 'file_delete');
}

export function readOutputText(response: Record<string, any>) {
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'refusal') throw new Error(content.refusal ?? 'The request was refused');
      if (content.type === 'output_text') return content.text as string;
    }
  }
  throw new Error('The model returned no text output');
}
