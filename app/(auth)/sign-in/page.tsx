import Link from 'next/link'

import { AuthCard } from '../_components/auth-card'
import { SignInForm } from '../_components/sign-in-form'

export const metadata = {
  title: 'Sign in · Contrario Notes',
}

export default function SignInPage() {
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Enter your credentials to continue."
      footer={
        <p>
          New to Contrario?{' '}
          <Link
            href="/sign-up"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <SignInForm />
    </AuthCard>
  )
}
