'use client'

import Image from 'next/image'
import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { RegistrationForm } from '@/components/registration-form'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEventDate, formatTimeRange } from '@/lib/format'

export default function EventPage() {
  const params = useParams<{ id: string }>()
  const event = useQuery(api.events.getPublic, { eventId: params.id as Id<'events'> })

  if (event === null) notFound()

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tutti gli eventi
        </Button>

        {event === undefined ? (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col gap-6">
              <Skeleton className="aspect-[16/9] w-full rounded-xl" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl">
                <Image
                  src={event.imageUrl || '/events/generic-event.png'}
                  alt={`Immagine dell'evento ${event.title}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 640px"
                  priority
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-balance">{event.title}</h1>
                <Badge variant={event.soldOut ? 'destructive' : 'secondary'}>
                  {event.soldOut ? 'Esaurito' : `${event.totalAvailable} posti liberi`}
                </Badge>
              </div>

              <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  {event.startsAt ? formatEventDate(event.startsAt) : 'Data da definire'}
                </span>
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {event.location}
                </span>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  {event.totalTaken} / {event.totalCapacity} posti occupati
                </span>
              </div>

              <p className="mt-6 leading-relaxed text-foreground/90 text-pretty">
                {event.description}
              </p>

              {/* Presentazione senza contenitori: su mobile questa lista si
                  tocca con il form di registrazione, anch'esso piatto. Non
                  reintrodurre riquadri qui. */}
              <section className="mt-8">
                <h2 className="text-lg font-semibold">Attività in programma</h2>
                <ul className="mt-4 flex flex-col gap-4">
                  {event.activities.map((activity) => (
                    <li key={activity.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{activity.title}</p>
                        <Badge variant="secondary">
                          {activity.slotDurationMinutes} min · {activity.slots.length} fasce
                        </Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        {formatTimeRange(activity.start, activity.end)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="lg:sticky lg:top-6 lg:self-start">
              <RegistrationForm event={event} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
