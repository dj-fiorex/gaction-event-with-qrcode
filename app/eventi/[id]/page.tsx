import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, MapPin, Users } from 'lucide-react'
import { RegistrationForm } from '@/components/registration-form'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatEventDate } from '@/lib/format'
import { getEvent } from '@/lib/queries'

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = getEvent(id)
  if (!event) notFound()

  const soldOut = event.seatsAvailable <= 0

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          render={<Link href="/" />}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tutti gli eventi
        </Button>

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
              <h1 className="text-2xl font-bold tracking-tight text-balance">
                {event.title}
              </h1>
              <Badge variant={soldOut ? 'destructive' : 'secondary'}>
                {soldOut ? 'Esaurito' : `${event.seatsAvailable} posti liberi`}
              </Badge>
            </div>

            <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {formatEventDate(event.date)}
              </span>
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {event.location}
              </span>
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden="true" />
                {event.seatsTaken} / {event.capacity} posti occupati
              </span>
            </div>

            <p className="mt-6 leading-relaxed text-foreground/90 text-pretty">
              {event.description}
            </p>

            {event.childOptions.allowChildren && (
              <p className="mt-4 rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">
                Evento aperto alle famiglie: puoi associare fino a{' '}
                {event.childOptions.maxChildrenPerRegistration} bambini alla tua registrazione.
              </p>
            )}
          </div>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <RegistrationForm event={event} />
          </div>
        </div>
      </main>
    </div>
  )
}
