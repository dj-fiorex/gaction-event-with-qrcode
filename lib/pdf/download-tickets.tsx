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

/**
 * Scarica un'immagine remota e la converte in data URL base64.
 * react-pdf carica le immagini via XHR e richiede header CORS: incorporare la
 * copertina come data URL evita che sparisca silenziosamente dal PDF.
 * Best-effort: se il fetch fallisce si restituisce undefined (PDF senza copertina).
 */
async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

async function triggerPdfDownload(
  persons: RegisteredPerson[],
  event: TicketPdfEvent,
  fileName: string,
): Promise<void> {
  const coverDataUrl = event.imageUrl
    ? await fetchImageAsDataUrl(event.imageUrl)
    : undefined
  const resolvedEvent: TicketPdfEvent = { ...event, coverDataUrl }
  const blob = await pdf(
    <TicketsDocument persons={persons} event={resolvedEvent} />,
  ).toBlob()
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
