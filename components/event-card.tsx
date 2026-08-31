import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { formatEventDate } from '@/lib/format'
import type { EventWithStats } from '@/lib/types'

export function EventCard({ event }: { event: EventWithStats }) {
  const soldOut = event.soldOut
  /**
   * La capienza è un concetto dello Slot: senza Attività non c'è alcun tetto
   * (ADR 0010). Il pubblico tace sui posti anziché annunciarne zero — e non
   * promette «illimitati», che la sala non garantisce.
   */
  const hasActivities = event.activities.length > 0
  return (
    <Card className="flex flex-col overflow-hidden pt-0">
      <div className="relative aspect-[16/9] w-full">
        <Image
          src={event.imageUrl || '/events/generic-event.png'}
          alt={`Immagine dell'evento ${event.title}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 400px"
        />
        {hasActivities && (
          <div className="absolute right-3 top-3">
            <Badge variant={soldOut ? 'destructive' : 'secondary'}>
              {soldOut ? 'Esaurito' : `${event.totalAvailable} posti liberi`}
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-3">
        <h2 className="text-lg font-semibold leading-tight text-balance">{event.title}</h2>
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            {event.startsAt ? formatEventDate(event.startsAt) : 'Data da definire'}
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            {event.location}
          </span>
          {hasActivities && (
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
              {event.totalTaken} / {event.totalCapacity} posti occupati
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          nativeButton={false}
          render={<Link href={`/eventi/${event.id}`} />}
        >
          Dettagli e registrazione
        </Button>
      </CardFooter>
    </Card>
  )
}
