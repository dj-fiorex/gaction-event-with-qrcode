'use client'

import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthActions } from '@convex-dev/auth/react'
import { useAction } from 'convex/react'
import { UserPlus } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/convex/_generated/api'
import { useCurrentUser } from '@/lib/use-current-user'
import { resolveInternalRedirect } from '@/lib/redirect-utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { messageFromError } from '@/lib/errors'

/** Reindirizza automaticamente se l'utente è già autenticato. */
function RegistrationRedirect() {
  const { user, isLoading } = useCurrentUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = resolveInternalRedirect(searchParams.get('redirect'))

  useEffect(() => {
    if (isLoading || !user) return
    if (user.role === 'member') router.replace(redirect ?? '/profilo')
    else if (user.role === 'admin') router.replace('/admin')
    else router.replace('/staff')
  }, [redirect, user, isLoading, router])

  return null
}

function RegistrationForm() {
  const { signIn } = useAuthActions()
  const signUpMember = useAction(api.accounts.signUpMember)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const redirect = resolveInternalRedirect(searchParams.get('redirect'))

    try {
      // 1. Create member account (role is always 'member', never from client input).
      await signUpMember({ name, email, password })

      // 2. Sign in to establish a session.
      const signInData = new FormData()
      signInData.set('flow', 'signIn')
      signInData.set('email', email)
      signInData.set('password', password)
      await signIn('password', signInData)

      router.replace(redirect ?? '/profilo')
    } catch (submitError) {
      setError(messageFromError(submitError, 'Registrazione non riuscita.'))
      setPending(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
        </span>
        <CardTitle>Crea il tuo account</CardTitle>
        <CardDescription>Registrati per partecipare agli eventi aziendali.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome e cognome</Label>
            <Input id="name" name="name" type="text" autoComplete="name" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">Almeno 8 caratteri.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Registrazione in corso…' : 'Registrati'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Hai già un account?{' '}
            <Link href="/accedi" className="underline underline-offset-4 hover:text-foreground">
              Accedi
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export default function RegistratiPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Suspense fallback={null}>
        <RegistrationRedirect />
        <RegistrationForm />
      </Suspense>
    </main>
  )
}
