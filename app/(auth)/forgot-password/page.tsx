import Link from 'next/link'

import { AuthCard } from '../_components/auth-card'
import { ForgotPasswordForm } from '../_components/forgot-password-form'

export const metadata = {
  title: 'Reset password · Contrario Notes',
}

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email associated with your account and we'll send you a reset link."
      footer={
        <p>
          Remembered it?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
