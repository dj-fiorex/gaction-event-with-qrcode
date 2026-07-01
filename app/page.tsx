import { EventCard } from '@/components/event-card'
import { SiteHeader } from '@/components/site-header'
import { getEvents } from '@/lib/queries'

export default function HomePage() {
  const events = getEvents()

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-balance">
            Eventi aziendali
          </h1>
          <p className="mt-2 text-muted-foreground text-pretty">
            Scopri gli eventi in programma, controlla la disponibilità e registrati.
            Riceverai un ticket con QR code direttamente via email.
          </p>
        </div>

        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
            Nessun evento disponibile al momento.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
