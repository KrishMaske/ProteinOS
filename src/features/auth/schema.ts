import { z } from 'zod';

export const authFormSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

export type AuthFormValues = z.infer<typeof authFormSchema>;
