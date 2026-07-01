'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, KeyRound, RefreshCw, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { rotateScanToken, updateCheckInPassword } from '@/lib/actions'
import type { CheckInAccess } from '@/lib/types'

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
  const router = useRouter()
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [password, setPassword] = useState('')
  const [rotating, startRotate] = useTransition()
  const [savingPassword, startSavePassword] = useTransition()

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

  function handleRotateToken() {
    if (
      !window.confirm(
        'Rigenerare il link? Il link precedente smetterà immediatamente di funzionare.',
      )
    ) {
      return
    }
    startRotate(async () => {
      const result = await rotateScanToken(eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Nuovo link generato')
      router.refresh()
    })
  }

  function handleSavePassword() {
    startSavePassword(async () => {
      const result = await updateCheckInPassword(eventId, password)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(hasCheckInPassword ? 'Password aggiornata' : 'Password impostata')
      setPassword('')
      router.refresh()
    })
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
