'use client'

import { pdf } from '@react-pdf/renderer'
import { TicketsDocument, type TicketPdfEvent } from './ticket-document'
import { fullName } from '@/lib/person-name'
import type { RegisteredPerson } from '@/lib/types'
import { slugify, ticketsPdfFilename } from './filename'

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Immagine di copertina non valida'))
    }
    img.src = objectUrl
  })
}

/**
 * Scarica la copertina remota e la ricodifica in un data URL JPEG.
 * react-pdf carica le immagini via XHR (serve CORS) e sa decodificare solo
 * JPEG/PNG: la copertina è salvata in WebP, che nel PDF risulterebbe invisibile.
 * Decodifichiamo quindi via canvas e riesportiamo in JPEG, così il formato
 * sorgente (WebP/PNG/JPEG) è indifferente.
 * Best-effort: in caso di errore si restituisce undefined (PDF senza copertina).
 */
async function fetchCoverAsJpegDataUrl(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    const image = await loadImageFromBlob(await response.blob())
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(image, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return undefined
  }
}

/**
 * Renderizza il PDF dei biglietti (una pagina per Persona) come Blob.
 *
 * L'opzione `includeCover` non c'è più: esisteva solo per l'allegato email,
 * che quando superava il tetto degli argomenti di una action si ritentava
 * senza copertina — in silenzio. Il PDF ora si renderizza server-side e non
 * attraversa più quegli argomenti, quindi né il tetto né il ripiego hanno
 * ragione di esistere (ADR 0015).
 */
export async function renderTicketsPdfBlob(
  persons: RegisteredPerson[],
  event: TicketPdfEvent,
): Promise<Blob> {
  const coverDataUrl = event.imageUrl
    ? await fetchCoverAsJpegDataUrl(event.imageUrl)
    : undefined
  const resolvedEvent: TicketPdfEvent = { ...event, coverDataUrl }
  return pdf(<TicketsDocument persons={persons} event={resolvedEvent} />).toBlob()
}

async function triggerPdfDownload(
  persons: RegisteredPerson[],
  event: TicketPdfEvent,
  fileName: string,
): Promise<void> {
  const blob = await renderTicketsPdfBlob(persons, event)
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
  return triggerPdfDownload(persons, event, ticketsPdfFilename(event.title))
}

/** Scarica un PDF con il solo biglietto della Persona indicata. */
export function downloadPersonTicket(
  person: RegisteredPerson,
  event: TicketPdfEvent,
): Promise<void> {
  return triggerPdfDownload(
    [person],
    event,
    `${slugify(event.title)}-${slugify(fullName(person))}.pdf`,
  )
}
