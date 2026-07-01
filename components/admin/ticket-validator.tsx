'use client'

import { useState, useTransition } from 'react'
import { Scanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner'
import { CheckCircle2, Keyboard, ScanLine, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { validateTicket } from '@/lib/actions'
import { formatDateTime } from '@/lib/format'
import type { TicketValidationResult } from '@/lib/types'

type Mode = 'camera' | 'manual'

export function TicketValidator() {
  const [mode, setMode] = useState<Mode>('camera')
  const [scanning, setScanning] = useState(true)
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<TicketValidationResult | null>(null)
  const [pending, startTransition] = useTransition()

  function runValidation(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return
    startTransition(async () => {
      const res = await validateTicket(trimmed)
      setResult(res)
    })
  }

  function handleScan(codes: IDetectedBarcode[]) {
    const value = codes[0]?.rawValue
    if (!value || pending) return
    setScanning(false)
    runValidation(value)
  }

  function reset() {
    setResult(null)
    setManualCode('')
    setScanning(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <Button
          variant={mode === 'camera' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setMode('camera')
            reset()
          }}
        >
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          Fotocamera
        </Button>
        <Button
          variant={mode === 'manual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setMode('manual')
            reset()
          }}
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
          Codice manuale
        </Button>
      </div>

      {mode === 'camera' ? (
        <Card>
          <CardContent className="p-4">
            {scanning && !result ? (
              <div className="overflow-hidden rounded-lg">
                <Scanner
                  onScan={handleScan}
                  onError={() => undefined}
                  constraints={{ facingMode: 'environment' }}
                  components={{ finder: true }}
                  styles={{ container: { width: '100%' } }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <p className="text-sm text-muted-foreground">
                  {pending ? 'Verifica in corso…' : 'Scansione completata.'}
                </p>
                <Button variant="outline" size="sm" onClick={reset}>
                  Scansiona un altro ticket
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Codice ticket</Label>
              <Input
                id="code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Es. TCK-XXXX-XXXX"
              />
            </div>
            <Button onClick={() => runValidation(manualCode)} disabled={pending || !manualCode.trim()}>
              {pending ? 'Verifica…' : 'Valida ticket'}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && <ValidationResult result={result} onReset={reset} />}
    </div>
  )
}

function ValidationResult({
  result,
  onReset,
}: {
  result: TicketValidationResult
  onReset: () => void
}) {
  const config = {
    valid: {
      icon: <CheckCircle2 className="h-6 w-6" aria-hidden="true" />,
      title: 'Ticket valido',
      className: 'border-primary bg-accent text-accent-foreground',
    },
    'already-used': {
      icon: <XCircle className="h-6 w-6" aria-hidden="true" />,
      title: 'Ticket già utilizzato',
      className: 'border-destructive bg-destructive/10 text-destructive',
    },
    'not-found': {
      icon: <XCircle className="h-6 w-6" aria-hidden="true" />,
      title: 'Ticket non riconosciuto',
      className: 'border-destructive bg-destructive/10 text-destructive',
    },
  }[result.status]

  return (
    <Card className={config.className}>
      <CardHeader className="flex-row items-center gap-3">
        {config.icon}
        <CardTitle className="text-lg">{config.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-foreground">
        {result.registration ? (
          <>
            <dl className="grid gap-1 text-sm">
              <Row label="Dipendente" value={result.registration.employeeName} />
              <Row label="Email" value={result.registration.employeeEmail} />
              <Row label="Reparto" value={result.registration.department} />
              {result.event && <Row label="Evento" value={result.event.title} />}
              <Row label="Bambini associati" value={String(result.registration.children.length)} />
              {result.status === 'already-used' && result.usedAt && (
                <Row label="Utilizzato il" value={formatDateTime(result.usedAt)} />
              )}
            </dl>
            {result.status === 'valid' && (
              <p className="text-sm font-medium text-primary">
                Accesso consentito. Il ticket è stato invalidato per usi futuri.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm">Nessun ticket corrisponde al codice fornito.</p>
        )}
        <Separator />
        <Button variant="outline" size="sm" className="self-start" onClick={onReset}>
          Nuova validazione
        </Button>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
