import { createClient } from 'npm:@supabase/supabase-js@2.109.0';

export function createUserClient(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new Error('Missing authorization header');

  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  );
}

export async function requireUser(request: Request) {
  const client = createUserClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Unauthorized');
  return { client, user: data.user };
}

export async function safetyIdentifier(userId: string) {
  const bytes = new TextEncoder().encode(userId);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
