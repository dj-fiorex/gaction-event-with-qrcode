'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoginForm } from '@/components/admin/login-form'
import { resolveInternalRedirect } from '@/lib/redirect-utils'
import { useCurrentUser } from '@/lib/use-current-user'

function LoginRedirect() {
  const { user, isLoading } = useCurrentUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = resolveInternalRedirect(searchParams.get('redirect'))

  useEffect(() => {
    if (isLoading || !user) return
    if (user.role === 'member') {
      router.replace(redirect ?? '/profilo')
    } else if (user.role === 'admin') {
      router.replace(redirect ?? '/admin')
    } else {
      router.replace('/staff')
    }
  }, [redirect, user, isLoading, router])

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
