'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { deleteEvent } from '@/lib/actions'
import { formatDateTime } from '@/lib/format'
import type { EventWithStats } from '@/lib/types'

interface AdminEventListProps {
  events: EventWithStats[]
}

export function AdminEventList({ events }: AdminEventListProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleDelete(id: string, title: string) {
    if (!window.confirm(`Eliminare l'evento "${title}" e tutte le sue registrazioni?`)) {
      return
    }
    setDeletingId(id)
    startTransition(async () => {
      const result = await deleteEvent(id)
      if (!result.success) {
        toast.error(result.error)
      } else {
        toast.success('Evento eliminato')
        router.refresh()
      }
      setDeletingId(null)
    })
  }

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nessun evento creato.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{event.title}</span>
              <Badge variant={event.seatsAvailable > 0 ? 'secondary' : 'outline'}>
                {event.seatsAvailable > 0
                  ? `${event.seatsAvailable} posti liberi`
                  : 'Completo'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{formatDateTime(event.date)}</span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {event.location}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {event.seatsTaken}/{event.capacity} posti
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDelete(event.id, event.title)}
            disabled={pending && deletingId === event.id}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Elimina
          </Button>
        </li>
      ))}
    </ul>
  )
}
