'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { AlertTriangle, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PdfDownloadButton } from '@/components/admin/pdf-download-button'
import { ResendTicketsDialog } from '@/components/admin/resend-tickets-dialog'
import { downloadAllTickets } from '@/lib/pdf/download-tickets'
import { formatDateRange, formatDateTime, EVENT_TIME_ZONE } from '@/lib/format'
import { toRegisteredPersons } from '@/lib/qr-client'
import type { EventWithStats, Registration } from '@/lib/types'
import { messageFromError } from '@/lib/errors'
import {
  deliveryNeedsAttention,
  type DeliveryOutcome,
  type DeliverySnapshot,
} from '@/lib/email-delivery'

interface RegistrationsTableProps {
  registrations: Registration[]
  events: EventWithStats[]
}

/**
 * Perché la Consegna chiede attenzione, in una frase per l'admin. Il motivo del
 * rifiuto non compare: sta sulla riga `emailDeliveries` per chi indaga, mentre
 * qui riempirebbe il tooltip di testo del provider.
 */
const DELIVERY_WARNING: Partial<Record<DeliveryOutcome, string>> = {
  rejected: 'Email rifiutata dal provider: correggi l’indirizzo e reinvia',
  failed: 'Invio non riuscito: puoi reinviare',
  simulated: 'Email non inviata: nessun provider email configurato',
  pending: 'Invio ancora in corso da troppo tempo: puoi reinviare',
}

/** Icona accanto al Contatto, solo dove la Consegna chiede attenzione. */
function DeliveryWarning({
  delivery,
  now,
}: {
  delivery: DeliverySnapshot | null
  now: number
}) {
  if (!delivery || !deliveryNeedsAttention(delivery, now)) return null
  const label = DELIVERY_WARNING[delivery.outcome] ?? 'Email di conferma da verificare'
  return (
    <span title={label} aria-label={label} role="img">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
    </span>
  )
}

export function RegistrationsTable({ registrations, events }: RegistrationsTableProps) {
  const cancelRegistration = useMutation(api.registrations.cancel)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  async function handleCancel(id: string, contactEmail: string) {
    if (
      !window.confirm(
        `Annullare la prenotazione di "${contactEmail}"? Le persone verranno rimosse, i posti liberati e i QR invalidati.`,
      )
    ) {
      return
    }
    setCancelingId(id)
    try {
      await cancelRegistration({ registrationId: id as Id<'registrations'> })
      toast.success('Prenotazione annullata')
    } catch (error) {
      toast.error(messageFromError(error, 'Annullamento non riuscito'))
    } finally {
      setCancelingId(null)
    }
  }

  if (registrations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nessuna registrazione presente.
      </p>
    )
  }

  const eventById = new Map(events.map((e) => [e.id, e]))

  // Soglia sul «in corso» letta una volta per render, non per riga: due
  // Prenotazioni pianificate nello stesso istante devono decidersi insieme.
  const now = Date.now()

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Evento</TableHead>
            <TableHead>Contatto</TableHead>
            <TableHead>Persone</TableHead>
            <TableHead>Attività</TableHead>
            <TableHead className="text-center">Ingressi</TableHead>
            <TableHead>Registrato il</TableHead>
            <TableHead className="text-right">Biglietti</TableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrations.map((r) => {
            const event = eventById.get(r.eventId)
            const children = r.persons.filter((p) => p.category === 'child').length
            const companions = r.persons.filter((p) => p.category === 'companion').length
            const checkedIn = r.persons.filter((p) => p.eventCheckInAt).length
            const withAllergies = r.persons.filter((p) => p.allergies)
            const reentries = r.persons.reduce(
              (sum, p) => sum + Math.max(0, (p.eventCheckInCount ?? 0) - 1),
              0,
            )
            const activities = r.selections
              // Selezione verso un'Attività che non esiste più (ADR 0008):
              // un id di documento non è un'informazione per un umano.
              .map((s) => event?.activities.find((a) => a.id === s.activityId)?.title ?? '—')
              .join(', ')

            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{event?.title ?? r.eventId}</TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {r.contactEmail}
                    {/* Consegna dell'email di conferma (ADR 0016): l'icona
                        compare solo dove serve attenzione. Una consegna
                        riuscita non mostra niente — una tabella in cui ogni
                        riga porta una spunta verde insegna a ignorare la
                        colonna. */}
                    <DeliveryWarning delivery={r.emailDelivery} now={now} />
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{r.persons.length} tot.</Badge>
                      {children > 0 && <Badge variant="outline">{children} figli</Badge>}
                      {companions > 0 && <Badge variant="outline">{companions} ospiti</Badge>}
                    </div>
                    {/* Allergie e intolleranze (issue #37): dettaglio per Persona,
                        visibile qui per ogni Prenotazione a prescindere dagli slot
                        scelti. Nessuna dichiarazione = nessuna riga. */}
                    {withAllergies.length > 0 && (
                      <ul className="text-xs text-muted-foreground">
                        {withAllergies.map((p) => (
                          <li key={p.id}>
                            <span className="font-medium">{p.name}</span>: {p.allergies}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-56 text-sm text-muted-foreground">
                  {activities || '—'}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>
                      {checkedIn}/{r.persons.length}
                    </span>
                    {reentries > 0 && (
                      <Badge variant="outline" className="font-normal">
                        +{reentries} {reentries === 1 ? 'rientro' : 'rientri'}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(r.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <PdfDownloadButton
                    onDownload={async () => {
                      if (!event) throw new Error('Evento non trovato')
                      const persons = await toRegisteredPersons(r.persons)
                      await downloadAllTickets(persons, {
                        title: event.title,
                        location: event.location,
                        dateRange: formatDateRange(event.startsAt, event.endsAt, {
                          timeZone: EVENT_TIME_ZONE,
                        }),
                        imageUrl: event.imageUrl,
                      })
                    }}
                    label={`Scarica biglietti di ${r.contactEmail}`}
                    successMessage="Biglietti pronti"
                    iconOnly
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {/* Reinvio dell'email dei biglietti (issue #40): il dialog
                        parte dall'email memorizzata ed è modificabile. */}
                    <ResendTicketsDialog registrationId={r.id} contactEmail={r.contactEmail} />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCancel(r.id, r.contactEmail)}
                      disabled={cancelingId === r.id}
                      aria-label={`Annulla prenotazione di ${r.contactEmail}`}
                      title={`Annulla prenotazione di ${r.contactEmail}`}
                    >
                      <Ban className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
