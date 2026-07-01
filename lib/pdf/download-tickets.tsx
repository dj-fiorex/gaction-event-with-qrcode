'use client'

import { pdf } from '@react-pdf/renderer'
import { TicketsDocument, type TicketPdfEvent } from './ticket-document'
import type { RegisteredPerson } from '@/lib/types'

/** Rende un testo sicuro per un nome file: solo alfanumerici e trattini. */
function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'evento'
  )
}

async function triggerPdfDownload(
  persons: RegisteredPerson[],
  event: TicketPdfEvent,
  fileName: string,
): Promise<void> {
  const blob = await pdf(<TicketsDocument persons={persons} event={event} />).toBlob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Scarica un unico PDF con una pagina per ciascuna Persona. */
export function downloadAllTickets(
  persons: RegisteredPerson[],
  event: TicketPdfEvent,
): Promise<void> {
  return triggerPdfDownload(persons, event, `${slugify(event.title)}-biglietti.pdf`)
}

/** Scarica un PDF con il solo biglietto della Persona indicata. */
export function downloadPersonTicket(
  person: RegisteredPerson,
  event: TicketPdfEvent,
): Promise<void> {
  return triggerPdfDownload(
    [person],
    event,
    `${slugify(event.title)}-${slugify(person.name)}.pdf`,
  )
}
