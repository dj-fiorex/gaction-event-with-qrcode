'use client'

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { Eye, LogIn, LogOut, Search, Ticket, Users } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { ParticipantRow } from '@/convex/checkins'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MomentValue } from '@/components/admin/check-in-moment'
import { filterParticipants } from '@/lib/participants-filter'
import { CATEGORY_LABEL } from '@/lib/person-labels'
import { fullName } from '@/lib/person-name'
import type { PersonStatus } from '@/lib/person-status'
import type { ScannerMode } from '@/lib/types'

interface ParticipantsListProps {
  eventId: string
  unlockToken?: string | null
  /** Momento selezionato in cima allo scanner: la riga lo eredita, non lo sceglie. */
  mode: ScannerMode
  /** Falso quando il momento richiede un'Attività non ancora scelta. */
  contextReady: boolean
  pending: boolean
  onCheckIn: (personId: Id<'persons'>) => Promise<void>
}

/** Etichetta del bottone di riga e verbo della conferma, per momento. */
const ACTION: Record<ScannerMode, { label: string; verb: string; icon: typeof LogIn }> = {
  event: { label: 'Ingresso', verb: "Registrare l'ingresso di", icon: LogIn },
  activity: { label: 'Accesso', verb: "Registrare l'accesso all'attività di", icon: Ticket },
  exit: { label: 'Uscita', verb: "Registrare l'uscita di", icon: LogOut },
  lookup: { label: 'Verifica', verb: '', icon: Eye },
}

/**
 * Elenco partecipanti: tutte le Persone dell'Evento raggruppate per
 * Prenotazione, con una ricerca, per il Check-in dall'elenco di chi arriva
 * senza QR. Chiuso di default: la fotocamera resta la via normale.
 *
 * La riga non decide il momento — lo prende dal punto di controllo già
 * selezionato — e i momenti che scrivono chiedono conferma nominando la
 * Persona: toccare la riga sbagliata è più facile che scansionare il QR
 * sbagliato, e un check-in registrato non si cancella.
 */
export function ParticipantsList({
  eventId,
  unlockToken,
  mode,
  contextReady,
  pending,
  onCheckIn,
}: ParticipantsListProps) {
  const groups = useQuery(api.checkins.participants, {
    eventId: eventId as Id<'events'>,
    unlockToken: unlockToken ?? undefined,
  })
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState<ParticipantRow | null>(null)

  const visible = useMemo(() => filterParticipants(groups ?? [], search), [groups, search])
  const totalPersons = useMemo(
    () => (groups ?? []).reduce((sum, g) => sum + g.persons.length, 0),
    [groups],
  )

  const action = ACTION[mode]

  function handleRowAction(row: ParticipantRow) {
    if (mode === 'lookup') {
      void onCheckIn(row.personId)
      return
    }
    setConfirming(row)
  }

  async function handleConfirm() {
    if (!confirming) return
    const personId = confirming.personId
    setConfirming(null)
    await onCheckIn(personId)
  }

  return (
    <Card className="px-4 py-0">
      <Accordion>
        <AccordionItem value="participants" className="border-b-0">
          <AccordionTrigger className="py-3 hover:no-underline">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden="true" />
              Elenco partecipanti
              {groups && (
                <span className="font-normal text-muted-foreground">
                  · {totalPersons} {totalPersons === 1 ? 'persona' : 'persone'} in{' '}
                  {groups.length} {groups.length === 1 ? 'prenotazione' : 'prenotazioni'}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3 pb-4">
            <p className="text-sm text-muted-foreground">
              Per chi arriva senza QR: cerca la persona e registra lo stesso controllo
              selezionato sopra.
            </p>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome, cognome o email"
                aria-label="Cerca un partecipante"
                autoComplete="off"
                className="pl-9"
              />
            </div>

            {groups === undefined ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Caricamento…</p>
            ) : visible.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {groups.length === 0
                  ? 'Nessuna prenotazione per questo evento.'
                  : 'Nessun partecipante corrisponde alla ricerca.'}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {visible.map((group) => (
                  <li key={group.registrationId} className="py-2">
                    <ul className="flex flex-col gap-1">
                      {group.persons.map((row, index) => (
                        <li key={row.personId}>
                          <ParticipantRowView
                            row={row}
                            contactEmail={index === 0 ? group.contactEmail : null}
                            actionLabel={action.label}
                            ActionIcon={action.icon}
                            disabled={pending || !contextReady}
                            onAction={() => handleRowAction(row)}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action.label}: conferma</DialogTitle>
            <DialogDescription>
              {confirming && (
                <>
                  {action.verb} <strong>{fullName(confirming)}</strong> (
                  {CATEGORY_LABEL[confirming.category]}
                  {confirming.age != null ? `, ${confirming.age} anni` : ''})? Un check-in
                  registrato non si può annullare.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Annulla</DialogClose>
            <Button type="button" onClick={handleConfirm}>
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

interface ParticipantRowViewProps {
  row: ParticipantRow
  /** Solo sulla riga dell'Utente, che intesta il gruppo. */
  contactEmail: string | null
  actionLabel: string
  ActionIcon: typeof LogIn
  disabled: boolean
  onAction: () => void
}

function ParticipantRowView({
  row,
  contactEmail,
  actionLabel,
  ActionIcon,
  disabled,
  onAction,
}: ParticipantRowViewProps) {
  const head = row.category === 'user'
  return (
    <div className={`flex items-center gap-3 ${head ? '' : 'pl-4'}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`truncate ${head ? 'font-medium' : ''}`}>{fullName(row)}</span>
          {!head && (
            <Badge variant="outline" className="px-1.5 py-0 text-xs font-normal">
              {CATEGORY_LABEL[row.category]}
              {row.age != null ? ` · ${row.age} anni` : ''}
            </Badge>
          )}
        </div>
        {contactEmail && (
          <span className="truncate text-xs text-muted-foreground">{contactEmail}</span>
        )}
        <CompactStatus status={row.status} />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={disabled}
        onClick={onAction}
        aria-label={`${actionLabel}: ${fullName(row)}`}
      >
        <ActionIcon className="h-4 w-4" aria-hidden="true" />
        {actionLabel}
      </Button>
    </div>
  )
}

const MOMENT_LABEL: Record<keyof PersonStatus, string> = {
  entry: 'Entrato',
  activity: 'Visita',
  exit: 'Uscito',
}

/** Stato consolidato in una riga: i soli momenti avvenuti, altrimenti un trattino. */
function CompactStatus({ status }: { status: PersonStatus }) {
  const happened = (Object.keys(MOMENT_LABEL) as (keyof PersonStatus)[]).filter(
    (key) => status[key].at,
  )
  if (happened.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" aria-label="nessun passaggio registrato">
        —
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      {happened.map((key) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">{MOMENT_LABEL[key]}</span>
          <MomentValue moment={status[key]} format="time" />
        </span>
      ))}
    </span>
  )
}
