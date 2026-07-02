'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/admin/login-form'
import { useCurrentUser } from '@/lib/use-current-user'

function LoginRedirect() {
  const { user, isLoading } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoading || !user) return
    router.replace(user.role === 'admin' ? '/admin' : '/staff')
  }, [user, isLoading, router])

  return null
}

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Suspense fallback={null}>
        <LoginRedirect />
        <LoginForm />
      </Suspense>
    </main>
  )
}
