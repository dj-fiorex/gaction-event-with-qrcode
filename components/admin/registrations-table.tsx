'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Ban } from 'lucide-react'
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
import { downloadAllTickets } from '@/lib/pdf/download-tickets'
import { formatDateRange, formatDateTime } from '@/lib/format'
import { toRegisteredPersons } from '@/lib/qr-client'
import type { EventWithStats, Registration } from '@/lib/types'

interface RegistrationsTableProps {
  registrations: Registration[]
  events: EventWithStats[]
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
      toast.error(error instanceof Error ? error.message : 'Annullamento non riuscito')
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
            const reentries = r.persons.reduce(
              (sum, p) => sum + Math.max(0, (p.eventCheckInCount ?? 0) - 1),
              0,
            )
            const activities = r.selections
              .map((s) => event?.activities.find((a) => a.id === s.activityId)?.title ?? s.activityId)
              .join(', ')

            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{event?.title ?? r.eventId}</TableCell>
                <TableCell className="text-muted-foreground">{r.contactEmail}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{r.persons.length} tot.</Badge>
                    {children > 0 && <Badge variant="outline">{children} figli</Badge>}
                    {companions > 0 && <Badge variant="outline">{companions} accomp.</Badge>}
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
                        dateRange: formatDateRange(event.startsAt, event.endsAt),
                        imageUrl: event.imageUrl,
                      })
                    }}
                    label={`Scarica biglietti di ${r.contactEmail}`}
                    successMessage="Biglietti pronti"
                    iconOnly
                  />
                </TableCell>
                <TableCell className="text-right">
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
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
