/**
 * Nome dei file PDF dei biglietti.
 *
 * Vive fuori da `download-tickets.tsx`, che è `'use client'`: da quando il PDF
 * si renderizza anche server-side (ADR 0015) il nome dell'allegato lo compone
 * anche `convex/emailContent.ts`, e deve restare quello del pulsante
 * «Scarica PDF» — una sola implementazione, non due che si allontanano.
 */

/** Rende un testo sicuro per un nome file: solo alfanumerici e trattini. */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'evento'
  )
}

/** Nome del PDF con tutti i biglietti di una Prenotazione. */
export function ticketsPdfFilename(eventTitle: string): string {
  return `${slugify(eventTitle)}-biglietti.pdf`
}
