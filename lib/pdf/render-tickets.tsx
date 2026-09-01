import { renderToBuffer } from '@react-pdf/renderer'
import { TicketsDocument, type TicketPdfEvent } from './ticket-document'
import { toRegisteredPersons } from '../qr-client'
import type { RegisteredPerson } from '../types'

/**
 * Render server-side del PDF dei biglietti — il gemello di
 * `download-tickets.tsx`, che resta nel browser per i pulsanti «Scarica PDF».
 *
 * Stesso documento (`ticket-document.tsx`), chiamata diversa: `pdf().toBlob()`
 * di là, `renderToBuffer()` di qua. L'aspetto non può quindi divergere
 * (ADR 0015). Diverge solo il modo di procurarsi la copertina: nel browser si
 * passa da un canvas, qui dai byte dello storage.
 */

/** Persona come la legge il server: il QR si genera qui dal ticketCode. */
export interface TicketPersonInput {
  firstName: string
  lastName: string | null
  category: RegisteredPerson['category']
  age: number | null
  allergies: string | null
  ticketCode: string
}

/**
 * Copertura dei formati di `@react-pdf/image`: JPEG e PNG, nient'altro.
 *
 * Le copertine caricate dal pannello sono WebP (`event-image-field.tsx`), che
 * nel browser passa per un canvas e viene ricodificata in JPEG prima del
 * render. Server-side quel canvas non esiste e nessun decoder WebP è
 * disponibile: una copertina WebP finirebbe per far fallire l'intero PDF, non
 * solo l'immagine. La sniffiamo quindi dai magic bytes e, se non è
 * decodificabile, il PDF parte senza copertina — i biglietti valgono uguale.
 */
function coverDataUrl(bytes: ArrayBuffer): string | undefined {
  const buffer = Buffer.from(bytes)
  if (buffer.length < 4) return undefined
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8
  if (!isPng && !isJpeg) {
    // Rumoroso di proposito: è la stessa perdita silenziosa che l'ADR 0015
    // contava fra i guasti inghiottiti, e non va reintrodotta di nascosto.
    console.warn(
      "[pdf] Copertina in un formato che @react-pdf non decodifica (probabile WebP): il PDF spedito parte senz'immagine.",
    )
    return undefined
  }
  return `data:image/${isPng ? 'png' : 'jpeg'};base64,${buffer.toString('base64')}`
}

/** Dati dell'Evento per l'header del biglietto, con la copertina già in byte. */
export interface TicketPdfEventInput extends Omit<TicketPdfEvent, 'imageUrl' | 'coverDataUrl'> {
  /** Byte della copertina letti dallo storage Convex. null = nessuna copertina. */
  coverBytes: ArrayBuffer | null
}

/**
 * Renderizza il PDF dei biglietti (una pagina per Persona) come Buffer Node.
 * I QR sono generati qui dai `ticketCode`: `lib/qr-client.ts` usa `qrcode`,
 * che è portabile e funziona anche fuori dal browser.
 */
export async function renderTicketsPdfBuffer(
  persons: TicketPersonInput[],
  event: TicketPdfEventInput,
): Promise<Buffer> {
  const registeredPersons = await toRegisteredPersons(persons)
  const { coverBytes, ...rest } = event
  const resolvedEvent: TicketPdfEvent = {
    ...rest,
    coverDataUrl: coverBytes ? coverDataUrl(coverBytes) : undefined,
  }
  return renderToBuffer(<TicketsDocument persons={registeredPersons} event={resolvedEvent} />)
}
