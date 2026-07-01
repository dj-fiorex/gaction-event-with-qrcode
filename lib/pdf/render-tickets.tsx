import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import { generateQrDataUrl } from '@/lib/qr'
import { formatDateRange } from '@/lib/format'
import type { Event, EventWithStats, Person } from '@/lib/types'
import type { RegisteredPerson } from '@/lib/actions'
import { TicketsDocument, type TicketPdfEvent } from './ticket-document'

/** Inizio della prima Attività e fine dell'ultima, ricavati dalle Attività dell'Evento. */
function eventDateBounds(activities: Event['activities']): {
  startsAt: string | null
  endsAt: string | null
} {
  let startsAt: string | null = null
  let endsAt: string | null = null
  for (const activity of activities) {
    if (!startsAt || activity.start < startsAt) startsAt = activity.start
    if (!endsAt || activity.end > endsAt) endsAt = activity.end
  }
  return { startsAt, endsAt }
}

/** Costruisce i metadati dell'header PDF da un Evento (raw o con statistiche). */
export function toTicketPdfEvent(event: Event | EventWithStats): TicketPdfEvent {
  const bounds =
    'startsAt' in event
      ? { startsAt: event.startsAt, endsAt: event.endsAt }
      : eventDateBounds(event.activities)
  return {
    title: event.title,
    location: event.location,
    dateRange: formatDateRange(bounds.startsAt, bounds.endsAt),
  }
}

/** Rigenera i QR dal ticketCode e mappa le Persone al formato usato dal documento PDF. */
export function toRegisteredPersons(persons: Person[]): Promise<RegisteredPerson[]> {
  return Promise.all(
    persons.map(async (p) => ({
      name: p.name,
      category: p.category,
      age: p.age,
      ticketCode: p.ticketCode,
      qrDataUrl: await generateQrDataUrl(p.ticketCode),
    })),
  )
}

/** Renderizza il PDF (una pagina per Persona) in un Buffer lato server. */
export function renderTicketsPdf(
  persons: RegisteredPerson[],
  event: TicketPdfEvent,
): Promise<Buffer> {
  return renderToBuffer(<TicketsDocument persons={persons} event={event} />)
}
