/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

async function createEventFixture(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const eventId = await ctx.db.insert('events', {
      title: 'Evento aziendale',
      description: 'Descrizione',
      location: 'Milano',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
      confirmParticipation: true,
    })
    return { eventId }
  })
}

/* ------------------------------------------------------------------ */
/* hasResponse: anticipo della regola «Una sola risposta per email»    */
/* ------------------------------------------------------------------ */

test('hasResponse is false for an email that has not answered the event', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)

  await expect(
    t.query(api.registrations.hasResponse, { eventId, email: 'mario@example.com' }),
  ).resolves.toBe(false)
})

test('hasResponse is true after a Prenotazione, normalizing trim and case', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)

  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'Mario@Example.com',
    children: [],
    companions: [],
    selections: [],
  })

  // Le Prenotazioni memorizzano `contactEmail` così come digitata: il
  // confronto deve normalizzare a lettura da entrambi i lati.
  await expect(
    t.query(api.registrations.hasResponse, { eventId, email: '  MARIO@EXAMPLE.COM ' }),
  ).resolves.toBe(true)
})

test('hasResponse is true after a Rinuncia, normalizing trim and case', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)

  await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  await expect(
    t.query(api.registrations.hasResponse, { eventId, email: ' Mario@Example.COM' }),
  ).resolves.toBe(true)
})

/**
 * Il cuore di ADR 0022: le due risposte sono indistinguibili da fuori. Se un
 * giorno qualcuno «allineasse» questa query ai due messaggi precisi delle
 * mutation, questo test cadrebbe — ed è esattamente il suo scopo.
 */
test('hasResponse does not reveal which answer was given', async () => {
  const t = convexTest(schema, modules)
  const { eventId: registeredEvent } = await createEventFixture(t)
  const { eventId: declinedEvent } = await createEventFixture(t)

  await t.mutation(api.registrations.register, {
    eventId: registeredEvent,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [],
  })
  await t.mutation(api.declines.decline, {
    eventId: declinedEvent,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  const fromRegistration = await t.query(api.registrations.hasResponse, {
    eventId: registeredEvent,
    email: 'mario@example.com',
  })
  const fromDecline = await t.query(api.registrations.hasResponse, {
    eventId: declinedEvent,
    email: 'mario@example.com',
  })
  expect(fromRegistration).toBe(fromDecline)
  expect(fromRegistration).toBe(true)
})

test('hasResponse is scoped to the event: the same email is free elsewhere', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)
  const { eventId: otherEvent } = await createEventFixture(t)

  await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  await expect(
    t.query(api.registrations.hasResponse, { eventId: otherEvent, email: 'mario@example.com' }),
  ).resolves.toBe(false)
})

test('hasResponse is false for an empty or blank email', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)

  await expect(
    t.query(api.registrations.hasResponse, { eventId, email: '' }),
  ).resolves.toBe(false)
  await expect(
    t.query(api.registrations.hasResponse, { eventId, email: '   ' }),
  ).resolves.toBe(false)
})
