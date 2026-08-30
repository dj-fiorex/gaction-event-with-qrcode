'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { Check, Copy, ExternalLink, KeyRound, RefreshCw, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CheckInAccess } from '@/lib/types'
import { messageFromError } from '@/lib/errors'

interface CheckInAccessCardProps {
  eventId: string
  scanToken: string
  checkInAccess: CheckInAccess
  hasCheckInPassword: boolean
}

export function CheckInAccessCard({
  eventId,
  scanToken,
  checkInAccess,
  hasCheckInPassword,
}: CheckInAccessCardProps) {
  const rotateScanToken = useMutation(api.events.rotateScanToken)
  const setCheckInPassword = useMutation(api.events.setCheckInPassword)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [password, setPassword] = useState('')
  const [rotating, setRotating] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const scanPath = `/scan/${scanToken}`
  const scanUrl = origin ? `${origin}${scanPath}` : scanPath

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(scanUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copia non riuscita')
    }
  }

  async function handleRotateToken() {
    if (
      !window.confirm(
        'Rigenerare il link? Il link precedente smetterà immediatamente di funzionare.',
      )
    ) {
      return
    }
    setRotating(true)
    try {
      await rotateScanToken({ eventId: eventId as Id<'events'> })
      toast.success('Nuovo link generato')
    } catch (error) {
      toast.error(messageFromError(error, 'Rigenerazione non riuscita'))
    } finally {
      setRotating(false)
    }
  }

  async function handleSavePassword() {
    setSavingPassword(true)
    try {
      await setCheckInPassword({ eventId: eventId as Id<'events'>, password })
      toast.success(hasCheckInPassword ? 'Password aggiornata' : 'Password impostata')
      setPassword('')
    } catch (error) {
      toast.error(messageFromError(error, 'Salvataggio non riuscito'))
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Accesso al check-in</CardTitle>
          <Badge variant={checkInAccess === 'password' ? 'secondary' : 'outline'}>
            {checkInAccess === 'password' ? 'Protetto da password' : 'Privato (admin/staff)'}
          </Badge>
        </div>
        <CardDescription>
          {checkInAccess === 'password'
            ? 'Chiunque abbia il link può accedere alla scansione inserendo la password.'
            : 'Il link apre la scansione solo con una sessione admin/staff attiva.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="scan-link">Link di scansione</Label>
          <div className="flex gap-2">
            <Input id="scan-link" value={scanUrl} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copia link">
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" nativeButton={false} render={<Link href={scanPath} />}>
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            Apri scansione
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleRotateToken} disabled={rotating}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {rotating ? 'Rigenerazione…' : 'Rigenera link'}
          </Button>
        </div>

        {checkInAccess === 'password' && (
          <div className="grid gap-2 border-t border-border pt-4">
            <Label htmlFor="new-password">
              {hasCheckInPassword ? 'Cambia password' : 'Imposta password'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasCheckInPassword ? 'Nuova password' : 'Password (min 4 caratteri)'}
                autoComplete="new-password"
              />
              <Button
                type="button"
                onClick={handleSavePassword}
                disabled={savingPassword || password.trim().length < 4}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {savingPassword ? 'Salvataggio…' : 'Salva'}
              </Button>
            </div>
            {hasCheckInPassword && (
              <p className="text-sm text-muted-foreground">
                Una password è attualmente impostata.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
