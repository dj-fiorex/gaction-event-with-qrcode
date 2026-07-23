'use client'

import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { Scanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner'
import { CheckCircle2, Clock, Keyboard, LogOut, Repeat, ScanLine, XCircle } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime, formatTimeRange } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/person-labels'
import type { CheckInMode, CheckInResult, EventWithStats } from '@/lib/types'

type InputMode = 'camera' | 'manual'

const POSITIVE = new Set<CheckInResult['status']>([
  'event-valid',
  'activity-valid',
  'exit-valid',
])
const WARNING = new Set<CheckInResult['status']>([
  'event-already',
  'activity-already',
  'exit-already',
])

interface TicketValidatorProps {
  event: EventWithStats
  unlockToken?: string | null
}

export function TicketValidator({ event, unlockToken }: TicketValidatorProps) {
  const checkIn = useMutation(api.checkins.checkIn)
  const [selectedMode, setSelectedMode] = useState<CheckInMode>('event')
  const [activityId, setActivityId] = useState<string>('')
  const [inputMode, setInputMode] = useState<InputMode>('camera')
  const [scanning, setScanning] = useState(true)
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [pending, setPending] = useState(false)

  const activityItems = useMemo(
    () =>
      event.activities.map((a) => ({
        value: a.id,
        label: `${a.title} · ${formatTimeRange(a.start, a.end)}`,
      })),
    [event],
  )

  // L'Uscita è offerta solo dagli Eventi con la Registrazione dell'uscita: se
  // l'admin la disattiva mentre lo scanner è aperto, il punto di controllo
  // torna all'ingresso invece di restare su una modalità ormai sparita.
  const checkMode: CheckInMode =
    selectedMode === 'exit' && !event.recordExit ? 'event' : selectedMode

  const contextReady = checkMode !== 'activity' || activityId.length > 0

  async function runCheckIn(code: string) {
    const trimmed = code.trim()
    if (!trimmed || !contextReady || pending) return
    setPending(true)
    try {
      const res = await checkIn({
        eventId: event.id as Id<'events'>,
        code: trimmed,
        mode: checkMode,
        activityId:
          checkMode === 'activity' ? (activityId as Id<'activities'>) : undefined,
        unlockToken: unlockToken ?? undefined,
      })
      setResult(res)
    } catch {
      setResult({
        status: 'not-found',
        message: 'Verifica non riuscita. Riprova.',
      })
    } finally {
      setPending(false)
    }
  }

  function handleScan(codes: IDetectedBarcode[]) {
    const value = codes[0]?.rawValue
    if (!value || pending) return
    setScanning(false)
    runCheckIn(value)
  }

  function reset() {
    setResult(null)
    setManualCode('')
    setScanning(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" aria-hidden="true" />
            Punto di controllo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>Tipo di controllo</Label>
            <div className={event.recordExit ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-2'}>
              <Button
                type="button"
                variant={checkMode === 'event' ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedMode('event')
                  reset()
                }}
              >
                Ingresso evento
              </Button>
              <Button
                type="button"
                variant={checkMode === 'activity' ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedMode('activity')
                  reset()
                }}
              >
                Accesso attività
              </Button>
              {event.recordExit && (
                <Button
                  type="button"
                  variant={checkMode === 'exit' ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedMode('exit')
                    reset()
                  }}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Uscita
                </Button>
              )}
            </div>
          </div>

          {checkMode === 'activity' && (
            <div className="grid gap-2">
              <Label htmlFor="activity">Attività</Label>
              <Select
                items={activityItems}
                value={activityId}
                onValueChange={(value) => {
                  setActivityId(value ?? '')
                  reset()
                }}
              >
                <SelectTrigger id="activity" className="w-full">
                  <SelectValue placeholder="Seleziona un'attività" />
                </SelectTrigger>
                <SelectContent>
                  {event.activities.map((activity) => (
                    <SelectItem key={activity.id} value={activity.id}>
                      {activity.title} · {formatTimeRange(activity.start, activity.end)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          variant={inputMode === 'camera' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setInputMode('camera')
            reset()
          }}
        >
          <ScanLine className="h-4 w-4" aria-hidden="true" />
          Fotocamera
        </Button>
        <Button
          variant={inputMode === 'manual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setInputMode('manual')
            reset()
          }}
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
          Codice manuale
        </Button>
      </div>

      {!contextReady && (
        <p className="text-sm text-muted-foreground">
          Seleziona un&apos;attività per abilitare la scansione.
        </p>
      )}

      {inputMode === 'camera' ? (
        <Card>
          <CardContent className="p-4">
            {scanning && !result && contextReady ? (
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
                  {pending
                    ? 'Verifica in corso…'
                    : result
                      ? 'Scansione completata.'
                      : 'Scansione in pausa.'}
                </p>
                <Button variant="outline" size="sm" onClick={reset} disabled={!contextReady}>
                  Scansiona un altro QR
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Codice QR</Label>
              <Input
                id="code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Es. TCK-XXXX-XXXX"
                autoComplete="off"
              />
            </div>
            <Button
              onClick={() => runCheckIn(manualCode)}
              disabled={pending || !manualCode.trim() || !contextReady}
            >
              {pending ? 'Verifica…' : 'Verifica accesso'}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && <ResultCard result={result} onReset={reset} />}
    </div>
  )
}

function ResultCard({ result, onReset }: { result: CheckInResult; onReset: () => void }) {
  const positive = POSITIVE.has(result.status)
  const warning = WARNING.has(result.status)

  const tone = positive
    ? 'border-primary bg-accent text-accent-foreground'
    : warning
      ? 'border-amber-500 bg-amber-500/10'
      : 'border-destructive bg-destructive/10 text-destructive'

  const isExit = result.status.startsWith('exit-')

  const Icon = positive ? CheckCircle2 : warning ? Clock : XCircle
  const title = positive
    ? isExit
      ? 'Uscita registrata'
      : 'Accesso consentito'
    : warning
      ? 'Attenzione'
      : isExit
        ? 'Uscita non registrata'
        : 'Accesso negato'

  return (
    <Card className={tone}>
      <CardHeader className="flex-row items-center gap-3">
        <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-foreground">
        <p className="text-sm font-medium">{result.message}</p>

        {typeof result.count === 'number' && result.count > 1 && (
          <Badge variant="secondary" className="w-fit gap-1">
            <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
            {result.count}° {isExit ? 'uscita' : 'ingresso'}
          </Badge>
        )}

        {result.person && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Persona</dt>
            <dd className="font-medium">
              {result.person.name}
              {result.person.age != null ? ` (${result.person.age} anni)` : ''}
            </dd>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>{CATEGORY_LABEL[result.person.category]}</dd>
            {/* Allergie e intolleranze (issue #37): mostrate a chi controlla gli
                ingressi per scelta esplicita del committente. */}
            {result.person.allergies && (
              <>
                <dt className="text-muted-foreground">Allergie</dt>
                <dd className="font-medium">{result.person.allergies}</dd>
              </>
            )}
            {result.eventTitle && (
              <>
                <dt className="text-muted-foreground">Evento</dt>
                <dd>{result.eventTitle}</dd>
              </>
            )}
            {result.activityTitle && (
              <>
                <dt className="text-muted-foreground">Attività</dt>
                <dd>{result.activityTitle}</dd>
              </>
            )}
            {result.slotStart && result.slotEnd && (
              <>
                <dt className="text-muted-foreground">Fascia oraria</dt>
                <dd>{formatTimeRange(result.slotStart, result.slotEnd)}</dd>
              </>
            )}
            {result.at && (
              <>
                <dt className="text-muted-foreground">{isExit ? 'Orario uscita' : 'Orario check-in'}</dt>
                <dd>{formatDateTime(result.at)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Ticket</dt>
            <dd className="font-mono text-xs tracking-widest">{result.person.ticketCode}</dd>
          </dl>
        )}

        <Separator />
        <Button variant="outline" size="sm" className="self-start" onClick={onReset}>
          Nuova verifica
        </Button>
      </CardContent>
    </Card>
  )
}
