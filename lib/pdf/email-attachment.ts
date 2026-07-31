'use client'

import { renderTicketsPdfBlob, slugify } from './download-tickets'
import type { TicketPdfEvent } from './ticket-document'
import type { RegisteredPerson } from '@/lib/types'

/** Allegato PDF nel formato atteso da `emails.sendTickets`. */
export interface TicketsPdfAttachment {
  filename: string
  base64Chunks: string[]
}

/** Convex limita ogni stringa a 1 MiB: il base64 viaggia spezzato in blocchi. */
const CHUNK_CHARS = 900_000

/**
 * Oltre questa soglia il PDF (in base64 pesa +33%) rischia di superare il
 * limite complessivo degli argomenti della action: si ritenta senza copertina,
 * perché sono le foto a pesare — le pagine con i soli QR restano pochi KB.
 */
const MAX_PDF_BYTES = 3_500_000

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function toChunks(base64: string): string[] {
  const chunks: string[] = []
  for (let i = 0; i < base64.length; i += CHUNK_CHARS) {
    chunks.push(base64.slice(i, i + CHUNK_CHARS))
  }
  return chunks
}

/**
 * Costruisce l'allegato email con lo stesso PDF del pulsante «Scarica PDF»
 * (una pagina per Persona). Best-effort come il resto dell'invio email:
 * undefined = email senza allegato, mai un invio bloccato dal PDF.
 */
export async function buildTicketsEmailPdf(
  persons: RegisteredPerson[],
  event: TicketPdfEvent,
): Promise<TicketsPdfAttachment | undefined> {
  try {
    let blob = await renderTicketsPdfBlob(persons, event)
    if (blob.size > MAX_PDF_BYTES) {
      blob = await renderTicketsPdfBlob(persons, event, { includeCover: false })
    }
    if (blob.size > MAX_PDF_BYTES) return undefined
    return {
      filename: `${slugify(event.title)}-biglietti.pdf`,
      base64Chunks: toChunks(await blobToBase64(blob)),
    }
  } catch {
    return undefined
  }
}
