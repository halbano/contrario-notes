import { z } from 'zod'

/**
 * Shared Zod schemas + result types for auth screens.
 *
 * Lives in its own module (rather than the `'use server'` actions file)
 * because Server Actions modules may only export async functions.
 *
 * The `auth-agent` MUST validate against these schemas server-side before
 * touching Supabase; the client uses them for live validation surfaces.
 */
export const signInSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

export const signUpSchema = z
  .object({
    email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters.')
      .regex(/[A-Z]/, 'Include at least one uppercase letter.')
      .regex(/[a-z]/, 'Include at least one lowercase letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })

export type AuthFieldErrors = Record<string, string[]>

export interface AuthActionResult {
  ok: boolean
  message?: string
  fieldErrors?: AuthFieldErrors
}
