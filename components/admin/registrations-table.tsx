import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'
import type { EventWithStats, Registration } from '@/lib/types'

interface RegistrationsTableProps {
  registrations: Registration[]
  events: EventWithStats[]
}

export function RegistrationsTable({ registrations, events }: RegistrationsTableProps) {
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrations.map((r) => {
            const event = eventById.get(r.eventId)
            const children = r.persons.filter((p) => p.category === 'child').length
            const companions = r.persons.filter((p) => p.category === 'companion').length
            const checkedIn = r.persons.filter((p) => p.eventCheckInAt).length
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
                  {checkedIn}/{r.persons.length}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(r.createdAt)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
