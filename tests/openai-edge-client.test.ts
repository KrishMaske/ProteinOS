import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createResponse,
  deleteOpenAIFile,
  OpenAIAPIError,
  openAIErrorDetails,
  uploadOpenAIFile,
} from '../supabase/functions/_shared/openai.ts';

function configureAPIKey() {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => name === 'OPENAI_API_KEY' ? 'test-api-key' : undefined },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAI Edge Function client', () => {
  it('uploads a Blob with user_data purpose and a one-hour expiration', async () => {
    configureAPIKey();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'file-abc123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_upload' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const fileId = await uploadOpenAIFile(
      new Blob(['pdf bytes'], { type: 'application/pdf' }),
      'routine.pdf',
    );

    expect(fileId).toBe('file-abc123');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/files');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-api-key');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    const form = init.body as FormData;
    expect(form.get('purpose')).toBe('user_data');
    expect(form.get('expires_after[anchor]')).toBe('created_at');
    expect(form.get('expires_after[seconds]')).toBe('3600');
    expect((form.get('file') as File).name).toBe('routine.pdf');
  });

  it('keeps only safe structured metadata from upstream API errors', async () => {
    configureAPIKey();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: 'Could not fetch https://signed.example/secret-token',
        code: 'invalid_value',
        type: 'invalid_request_error',
        param: 'input[0].content[1].file_url',
      },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_safe123' },
    })));

    let caught: unknown;
    try {
      await createResponse({ model: 'test-model' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OpenAIAPIError);
    expect((caught as Error).message).not.toContain('signed.example');
    expect(openAIErrorDetails(caught)).toEqual({
      status: 400,
      code: 'invalid_value',
      type: 'invalid_request_error',
      param: 'input[0].content[1].file_url',
      requestId: 'req_safe123',
      stage: 'responses',
    });
    expect(caught).not.toHaveProperty('payload');
  });

  it('treats an already-missing temporary file as deleted', async () => {
    configureAPIKey();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteOpenAIFile('file-abc123')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/files/file-abc123',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
