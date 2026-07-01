'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { Lock } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ScanPasswordGateProps {
  scanToken: string
  eventTitle: string
  onUnlocked: (unlockToken: string) => void
}

export function ScanPasswordGate({ scanToken, eventTitle, onUnlocked }: ScanPasswordGateProps) {
  const unlockScan = useMutation(api.checkins.unlockScan)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    try {
      const result = await unlockScan({ scanToken, password })
      if (result.ok && result.unlockToken) {
        onUnlocked(result.unlockToken)
      } else {
        setError('Password non corretta. Riprova.')
        setPending(false)
      }
    } catch {
      setError('Verifica non riuscita. Riprova.')
      setPending(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Lock className="h-5 w-5" aria-hidden="true" />
        </span>
        <CardTitle className="text-balance">{eventTitle}</CardTitle>
        <CardDescription>
          Inserisci la password per accedere al check-in di questo evento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="scan-password">Password</Label>
            <Input
              id="scan-password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Verifica in corso…' : 'Accedi al check-in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
