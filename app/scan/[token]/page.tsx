import { notFound, redirect } from 'next/navigation'
import { CalendarClock, MapPin, ScanLine } from 'lucide-react'
import { TicketValidator } from '@/components/admin/ticket-validator'
import { ScanPasswordGate } from '@/components/scan/scan-password-gate'
import { getRole, hasScanSession } from '@/lib/auth'
import { formatDateRange } from '@/lib/format'
import { getEventByScanToken } from '@/lib/queries'

export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const event = getEventByScanToken(token)
  if (!event) {
    notFound()
  }

  const role = await getRole()

  // Eventi privati: accessibili solo con una sessione admin/staff valida.
  if (event.checkInAccess === 'private' && !role) {
    redirect('/admin/login')
  }

  // Eventi password-protected: mostra il gate se non c'è né sessione staff né
  // una sessione di scansione valida per questo token.
  const unlocked = role !== null || (await hasScanSession(token))
  if (event.checkInAccess === 'password' && !unlocked) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
        <ScanPasswordGate token={token} eventTitle={event.title} />
      </main>
    )
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ScanLine className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>Check-in</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{event.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              {formatDateRange(event.startsAt, event.endsAt)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {event.location}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Scansiona o inserisci il codice del QR. Scegli se registrare l&apos;ingresso
            all&apos;evento oppure l&apos;accesso a una singola attività.
          </p>
        </div>
        <TicketValidator event={event} />
      </main>
    </div>
  )
}
