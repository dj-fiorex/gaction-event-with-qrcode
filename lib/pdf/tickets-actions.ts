'use server'

import { isAdmin } from '@/lib/auth'
import { getEvent, getRegistrations } from '@/lib/queries'
import type { ActionResult, Person } from '@/lib/types'
import { renderTicketsPdf, toRegisteredPersons, toTicketPdfEvent } from './render-tickets'

interface TicketsPdfPayload {
  base64: string
  filename: string
}

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

async function buildTicketsPdf(
  eventId: string,
  persons: Person[],
  filename: string,
): Promise<ActionResult<TicketsPdfPayload>> {
  const event = getEvent(eventId)
  if (!event) {
    return { success: false, error: 'Evento non trovato' }
  }
  if (persons.length === 0) {
    return { success: false, error: 'Nessun biglietto da generare' }
  }

  const registeredPersons = await toRegisteredPersons(persons)
  const buffer = await renderTicketsPdf(registeredPersons, toTicketPdfEvent(event))

  return {
    success: true,
    data: { base64: buffer.toString('base64'), filename },
  }
}

/** Scarica un unico PDF con i biglietti di tutte le Persone iscritte all'Evento. */
export async function exportEventTicketsPdf(
  eventId: string,
): Promise<ActionResult<TicketsPdfPayload>> {
  if (!(await isAdmin())) {
    return { success: false, error: 'Accesso non autorizzato' }
  }

  const event = getEvent(eventId)
  if (!event) {
    return { success: false, error: 'Evento non trovato' }
  }

  const persons = getRegistrations(eventId).flatMap((r) => r.persons)
  return buildTicketsPdf(eventId, persons, `${slugify(event.title)}-biglietti.pdf`)
}

/** Scarica il PDF con i biglietti di tutte le Persone di una singola Prenotazione. */
export async function exportRegistrationTicketsPdf(
  registrationId: string,
): Promise<ActionResult<TicketsPdfPayload>> {
  if (!(await isAdmin())) {
    return { success: false, error: 'Accesso non autorizzato' }
  }

  const registration = getRegistrations().find((r) => r.id === registrationId)
  if (!registration) {
    return { success: false, error: 'Registrazione non trovata' }
  }

  const event = getEvent(registration.eventId)
  const contact = slugify(registration.contactEmail.split('@')[0] ?? 'contatto')
  const prefix = event ? slugify(event.title) : 'evento'
  return buildTicketsPdf(
    registration.eventId,
    registration.persons,
    `${prefix}-${contact}.pdf`,
  )
}
