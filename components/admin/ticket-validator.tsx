'use client'

import { useMemo, useState } from 'react'
import { useConvex, useMutation } from 'convex/react'
import { Scanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner'
import { CheckCircle2, Clock, Eye, Keyboard, LogOut, Repeat, ScanLine, XCircle } from 'lucide-react'
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
import { MomentValue } from '@/components/admin/check-in-moment'
import { formatDateTime, formatTimeRange } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/person-labels'
import type { PersonStatus } from '@/lib/person-status'
import type { CheckInResult, EventWithStats, ScannerMode } from '@/lib/types'

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
  // «Solo verifica» legge una query una tantum, non una sottoscrizione: il
  // client Convex imperativo evita di tenere viva una subscription per un QR
  // che l'operatore ha già finito di guardare.
  const convex = useConvex()
  const [selectedMode, setSelectedMode] = useState<ScannerMode>('event')
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

  // «Solo verifica» chiude la fila: è sempre disponibile, perché leggere lo
  // stato consolidato non dipende da nessuna impostazione dell'Evento.
  const modes = useMemo(
    () => [
      { value: 'event' as const, label: 'Ingresso evento', icon: null },
      { value: 'activity' as const, label: 'Accesso attività', icon: null },
      ...(event.recordExit
        ? [
            {
              value: 'exit' as const,
              label: 'Uscita',
              icon: <LogOut className="h-4 w-4" aria-hidden="true" />,
            },
          ]
        : []),
      {
        value: 'lookup' as const,
        label: 'Solo verifica',
        icon: <Eye className="h-4 w-4" aria-hidden="true" />,
      },
    ],
    [event.recordExit],
  )

  // L'Uscita è offerta solo dagli Eventi con la Registrazione dell'uscita: se
  // l'admin la disattiva mentre lo scanner è aperto, il punto di controllo
  // torna all'ingresso invece di restare su una modalità ormai sparita.
  const checkMode: ScannerMode =
    selectedMode === 'exit' && !event.recordExit ? 'event' : selectedMode

  const contextReady = checkMode !== 'activity' || activityId.length > 0

  async function runCheckIn(code: string) {
    const trimmed = code.trim()
    if (!trimmed || !contextReady || pending) return
    setPending(true)
    try {
      const res =
        checkMode === 'lookup'
          ? // «Solo verifica»: una query, che nel runtime Convex non può scrivere.
            await convex.query(api.checkins.lookup, {
              eventId: event.id as Id<'events'>,
              code: trimmed,
              unlockToken: unlockToken ?? undefined,
            })
          : await checkIn({
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
            <div className="grid grid-cols-2 gap-2">
              {modes.map((mode) => (
                <Button
                  key={mode.value}
                  type="button"
                  variant={checkMode === mode.value ? 'default' : 'outline'}
                  onClick={() => {
                    setSelectedMode(mode.value)
                    reset()
                  }}
                >
                  {mode.icon}
                  {mode.label}
                </Button>
              ))}
            </div>
            {checkMode === 'lookup' && (
              <p className="text-sm text-muted-foreground">
                Mostra lo stato della persona senza registrare nulla.
              </p>
            )}
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
  // «Solo verifica» non è né consentito né negato: non ha deciso nulla, ha solo
  // guardato. Merita un tono neutro, altrimenti l'operatore legge un verde o un
  // rosso che nessuna scrittura giustifica.
  const neutral = result.status === 'lookup'
  const positive = POSITIVE.has(result.status)
  const warning = WARNING.has(result.status)

  const tone = neutral
    ? 'border-border bg-muted/40'
    : positive
      ? 'border-primary bg-accent text-accent-foreground'
      : warning
        ? 'border-amber-500 bg-amber-500/10'
        : 'border-destructive bg-destructive/10 text-destructive'

  const isExit = result.status.startsWith('exit-')

  const Icon = neutral ? Eye : positive ? CheckCircle2 : warning ? Clock : XCircle
  const title = neutral
    ? 'Solo verifica'
    : positive
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

        {result.personStatus && <StatusPanel status={result.personStatus} />}

        <Separator />
        <Button variant="outline" size="sm" className="self-start" onClick={onReset}>
          Nuova verifica
        </Button>
      </CardContent>
    </Card>
  )
}

const MOMENT_LABEL: Record<keyof PersonStatus, string> = {
  entry: 'Entrato',
  activity: 'Visita',
  exit: 'Uscito',
}

/**
 * Stato consolidato (issue #39): «entrato ore X · visita ore Y · uscito ore Z».
 * Compare dopo ogni scansione, qualunque sia il momento scansionato, così
 * l'operatore non deve ricostruire il percorso della Persona dalle sue
 * scansioni precedenti.
 */
function StatusPanel({ status }: { status: PersonStatus }) {
  const moments = (Object.keys(MOMENT_LABEL) as (keyof PersonStatus)[]).map((key) => ({
    key,
    label: MOMENT_LABEL[key],
    moment: status[key],
  }))

  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Stato della persona
      </p>
      <ul className="flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5">
        {moments.map(({ key, label, moment }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{label}</span>
            <MomentValue moment={moment} format="time" />
          </li>
        ))}
      </ul>
    </div>
  )
}
