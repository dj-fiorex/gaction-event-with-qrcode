'use client'

import { useActionState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { unlockScanAction, type ScanUnlockState } from '@/lib/actions'

const initialState: ScanUnlockState = {}

interface ScanPasswordGateProps {
  token: string
  eventTitle: string
}

export function ScanPasswordGate({ token, eventTitle }: ScanPasswordGateProps) {
  const [state, formAction, pending] = useActionState(unlockScanAction, initialState)

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
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
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
          <div className="flex items-center gap-2">
            <Checkbox id="remember" name="remember" />
            <Label htmlFor="remember" className="font-normal">
              Ricordami su questo dispositivo (12 ore)
            </Label>
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Verifica in corso…' : 'Accedi al check-in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
