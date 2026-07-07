'use client'

import { useState, type FormEvent } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useQuery, useAction } from 'convex/react'
import { Lock, UserPlus } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const { signIn } = useAuthActions()
  const needsBootstrap = useQuery(api.accounts.needsBootstrap)
  const seedFirstAdmin = useAction(api.accounts.seedFirstAdmin)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const formData = new FormData(event.currentTarget)

    try {
      if (needsBootstrap) {
        const email = String(formData.get('email') ?? '')
        const password = String(formData.get('password') ?? '')
        const name = String(formData.get('name') ?? '')
        await seedFirstAdmin({ email, password, name })
      }
      const signInData = new FormData()
      signInData.set('flow', 'signIn')
      signInData.set('email', String(formData.get('email') ?? ''))
      signInData.set('password', String(formData.get('password') ?? ''))
      await signIn('password', signInData)
      // Navigation is handled by LoginRedirect (role-based routing).
    } catch (submitError) {
      setError(
        needsBootstrap
          ? submitError instanceof Error
            ? submitError.message
            : 'Creazione account non riuscita.'
          : 'Credenziali non valide. Riprova.',
      )
      setPending(false)
    }
  }

  const bootstrap = needsBootstrap === true

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {bootstrap ? (
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Lock className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <CardTitle>{bootstrap ? 'Configura amministratore' : 'Area riservata'}</CardTitle>
        <CardDescription>
          {bootstrap
            ? 'Nessun account presente. Crea il primo account amministratore.'
            : 'Accedi con le credenziali admin o assistente.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {bootstrap && (
            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" type="text" autoComplete="name" required />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={bootstrap ? 'new-password' : 'current-password'}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending || needsBootstrap === undefined} className="w-full">
            {pending
              ? bootstrap
                ? 'Creazione in corso…'
                : 'Accesso in corso…'
              : bootstrap
                ? 'Crea e accedi'
                : 'Accedi'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
