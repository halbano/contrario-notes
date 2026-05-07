import Link from 'next/link'

import { AuthCard } from '../_components/auth-card'
import { SignUpForm } from '../_components/sign-up-form'

export const metadata = {
  title: 'Create account · Contrario Notes',
}

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Set up Contrario Notes for you and your team."
      footer={
        <p>
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthCard>
  )
}
