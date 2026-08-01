'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useAction } from 'convex/react'
import { CheckCircle2, KeyRound, MailQuestion } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PasswordResetCard({
  initialCode,
  initialEmail,
}: {
  initialCode: string | null
  initialEmail: string | null
}) {
  const requestPasswordReset = useAction(api.accounts.requestPasswordReset)
  const completePasswordReset = useAction(api.accounts.completePasswordReset)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const resetMode = Boolean(initialCode)

  async function handleRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setPending(true)

    try {
      const formData = new FormData(event.currentTarget)
      await requestPasswordReset({
        email: String(formData.get('email') ?? ''),
      })
      setSuccessMessage(
        "Se l'indirizzo è associato a un account, riceverai un'email con il link per reimpostare la password.",
      )
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Invio email di reset non riuscito.',
      )
    } finally {
      setPending(false)
    }
  }

  async function handleResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setPending(true)

    try {
      const formData = new FormData(event.currentTarget)
      await completePasswordReset({
        code: initialCode ?? '',
        email: String(formData.get('email') ?? ''),
        newPassword: String(formData.get('newPassword') ?? ''),
      })
      setSuccessMessage('Password aggiornata. Ora puoi accedere con la nuova password.')
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Reimpostazione password non riuscita.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {successMessage ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : resetMode ? (
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          ) : (
            <MailQuestion className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <CardTitle>{resetMode ? 'Imposta una nuova password' : 'Password dimenticata'}</CardTitle>
        <CardDescription>
          {resetMode
            ? 'Scegli una nuova password per rientrare nel tuo account.'
            : "Inserisci l'email del tuo account per ricevere il link di reset."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {successMessage ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">{successMessage}</p>
            <div className="flex justify-center">
              <Button nativeButton={false} render={<Link href="/accedi" />}>
                Vai al login
              </Button>
            </div>
          </div>
        ) : resetMode ? (
          initialEmail ? (
            <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  defaultValue={initialEmail}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newPassword">Nuova password</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? 'Salvataggio in corso…' : 'Salva nuova password'}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm text-destructive">Link di reset mancante o non valido.</p>
              <Button variant="outline" nativeButton={false} render={<Link href="/reimposta-password" />}>
                Richiedi un nuovo link
              </Button>
            </div>
          )
        ) : (
          <form onSubmit={handleRequestSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'Invio in corso…' : 'Invia link di reset'}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/accedi" />}>
              Torna al login
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
