import { z } from 'zod';

const clientEnvironmentSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url().refine((url) => url.startsWith('https://'), {
    message: 'Supabase URL must use HTTPS',
  }),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

const parsedEnvironment = clientEnvironmentSchema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const clientEnvironment = parsedEnvironment.success
  ? parsedEnvironment.data
  : null;

export const clientEnvironmentError = parsedEnvironment.success
  ? null
  : parsedEnvironment.error.issues.map((issue) => issue.message).join(', ');
