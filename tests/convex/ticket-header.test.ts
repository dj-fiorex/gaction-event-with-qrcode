/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

import { resolveTicketHeader } from '../../lib/pdf/ticket-header'

const modules = import.meta.glob('../../convex/**/*.ts')

/* ------------------------------------------------------------------ */
/* La regola pura: cosa mostra davvero l'intestazione                  */
/* ------------------------------------------------------------------ */

test("Intestazione del Biglietto: 'image' vale solo se l'immagine c'è davvero", () => {
  expect(resolveTicketHeader('image', true)).toBe('image')
})

test('Intestazione del Biglietto: senza immagine si torna sempre al titolo', () => {
  // Il ripiego è inderogabile: un biglietto senza intestazione non direbbe a
  // quale Evento appartiene, e non è uno stato che l'admin possa ottenere.
  expect(resolveTicketHeader('image', false)).toBe('title')
})

test("Intestazione del Biglietto: 'title' non usa l'immagine al posto del titolo", () => {
  expect(resolveTicketHeader('title', true)).toBe('title')
  expect(resolveTicketHeader('title', false)).toBe('title')
})

test('Intestazione del Biglietto: assente vale titolo, come per gli Eventi già esistenti', () => {
  // Il campo è `optional` sullo schema: un Evento creato prima di questa
  // scelta non ha nulla scritto, e il suo biglietto non deve cambiare.
  expect(resolveTicketHeader(undefined, true)).toBe('title')
  expect(resolveTicketHeader(undefined, false)).toBe('title')
})

/* ------------------------------------------------------------------ */
/* La scelta arriva fino all'allegato dell'email                       */
/* ------------------------------------------------------------------ */

async function seedRegistration(
  t: ReturnType<typeof convexTest>,
  ticketHeader?: 'title' | 'image',
): Promise<Id<'registrations'>> {
  return t.run(async (ctx) => {
    const eventId = await ctx.db.insert('events', {
      title: 'Maestri test',
      description: 'Descrizione',
      location: 'Roma',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess: 'private',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
      // Omesso = campo assente in tabella, cioè l'Evento di prima della scelta.
      ...(ticketHeader === undefined ? {} : { ticketHeader }),
    })
    const registrationId = await ctx.db.insert('registrations', {
      eventId,
      contactEmail: 'anna@example.com',
    })
    await ctx.db.insert('persons', {
      eventId,
      registrationId,
      firstName: 'Anna',
      lastName: 'Bianchi',
      nameProvided: true,
      category: 'user',
      age: null,
      ticketCode: 'TCK-ANNA',
      eventCheckInAt: null,
      eventCheckInCount: 0,
      eventCheckInLastAt: null,
    })
    return registrationId
  })
}

test("Intestazione del Biglietto: la scelta arriva al PDF allegato all'email", async () => {
  const t = convexTest(schema, modules)
  const registrationId = await seedRegistration(t, 'image')

  const document = await t.query(internal.emailContent.ticketEmailDocument, { registrationId })

  // L'allegato è la superficie da cui i biglietti arrivano davvero: una scelta
  // che valesse solo per i PDF scaricati a mano non sarebbe dell'Evento.
  expect(document.pdf.ticketHeader).toBe('image')
})

test('Intestazione del Biglietto: assente in tabella, il documento email dice titolo', async () => {
  const t = convexTest(schema, modules)
  const registrationId = await seedRegistration(t)

  const document = await t.query(internal.emailContent.ticketEmailDocument, { registrationId })

  expect(document.pdf.ticketHeader).toBe('title')
})
