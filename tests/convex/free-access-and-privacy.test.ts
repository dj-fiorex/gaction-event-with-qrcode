/// <reference types="vite/client" />

/**
 * Attività ad accesso libero (ADR 0011) e Consenso all'informativa (ADR 0012).
 *
 * Le due esenzioni dell'accesso libero — policy di selezione e sovrapposizioni
 * — sono regole che spariscono in silenzio: se qualcuno le rimuove, il form
 * continua a funzionare e a rifiutare prenotazioni legittime. Stessa cosa per
 * il rifiuto del consenso, che vive nella mutation proprio perché un bottone
 * disabilitato non prova nulla.
 */

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

function createTestApp() {
  return convexTest(schema, modules)
}
type TestApp = ReturnType<typeof createTestApp>

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createAdmin(t: TestApp) {
  return t.run((ctx) =>
    ctx.db.insert('users', { email: 'admin@example.com', name: 'Admin', role: 'admin' }),
  )
}

interface ActivityInput {
  title: string
  start: string
  end: string
  slotDurationMinutes: number
  capacityPerSlot: number
  freeAccess?: boolean
}

/** Visita libera 15–17: la finestra larga che collide con tutto ciò che accade dentro. */
const VISITA: ActivityInput = {
  title: 'Visita allo stabilimento',
  start: '2026-07-07T15:00',
  end: '2026-07-07T17:00',
  slotDurationMinutes: 30,
  capacityPerSlot: 10,
  freeAccess: true,
}

/** Laboratorio 16:00–16:30: dentro la finestra della visita. */
const LABORATORIO: ActivityInput = {
  title: 'Laboratorio',
  start: '2026-07-07T16:00',
  end: '2026-07-07T16:30',
  slotDurationMinutes: 30,
  capacityPerSlot: 10,
}

function buildEventInput(
  activities: ActivityInput[],
  overrides: Partial<{
    activityPolicy: 'all' | 'min' | 'free'
    minActivities: number
    allowOverlap: boolean
    confirmParticipation: boolean
    privacyNotice: string
  }> = {},
) {
  return {
    title: 'Maestri d’Acciaio',
    description: 'Descrizione abbastanza lunga',
    location: 'Brescia',
    activityPolicy: 'free' as const,
    minActivities: 0,
    allowOverlap: false,
    checkInToleranceMinutes: 15,
    allowQrReuse: false,
    requireAccount: false,
    confirmParticipation: false,
    collectNames: true,
    collectAllergies: false,
    recordExit: false,
    allowChildren: false,
    maxChildrenPerRegistration: 0,
    allowCompanions: false,
    maxCompanionsPerRegistration: 0,
    checkInAccess: 'private' as const,
    checkInPassword: '',
    activities,
    ...overrides,
  }
}

async function createEvent(t: TestApp, input: ReturnType<typeof buildEventInput>) {
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })
  const { id: eventId } = await asAdmin.mutation(api.events.create, input)
  const event = await asAdmin.query(api.events.getForAdmin, { eventId })
  return { eventId, event: event!, asAdmin }
}

function selection(activity: { id: string; slots: { id: string }[] }) {
  return {
    activityId: activity.id as Id<'activities'>,
    slotId: activity.slots[0].id as Id<'slots'>,
  }
}

/* ------------------------------------------------------------------ */
/* Attività ad accesso libero (ADR 0011)                               */
/* ------------------------------------------------------------------ */

test('genera un solo Slot largo quanto l’Attività e senza tetto', async () => {
  const t = createTestApp()
  const { event } = await createEvent(t, buildEventInput([VISITA]))

  const visita = event.activities[0]
  expect(visita.freeAccess).toBe(true)
  expect(visita.slots).toHaveLength(1)
  expect(visita.slots[0].capacity).toBeNull()
  expect(visita.slots[0].available).toBeNull()
  // La finestra dello Slot è quella dell'Attività, non una fascia da 30 minuti.
  expect(new Date(visita.slots[0].start).toISOString()).toBe(
    new Date(visita.start).toISOString(),
  )
  expect(new Date(visita.slots[0].end).toISOString()).toBe(new Date(visita.end).toISOString())
})

test('un Evento di sola visita libera non ha capienza e non è mai esaurito', async () => {
  const t = createTestApp()
  const { eventId } = await createEvent(t, buildEventInput([VISITA]))

  const pubblico = await t.query(api.events.getPublic, { eventId })
  // Senza tetto i totali non diventano NaN e «Esaurito» non può accendersi.
  expect(pubblico?.totalCapacity).toBe(0)
  expect(pubblico?.totalAvailable).toBe(0)
  expect(pubblico?.soldOut).toBe(false)
})

test('la visita libera non collide con un’Attività che le cade dentro', async () => {
  const t = createTestApp()
  const { eventId, event } = await createEvent(
    t,
    buildEventInput([VISITA, LABORATORIO], { allowOverlap: false }),
  )

  // Il laboratorio 16:00–16:30 sta dentro la visita 15:00–17:00: senza
  // l'esenzione questa prenotazione verrebbe rifiutata.
  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [selection(event.activities[0]), selection(event.activities[1])],
  })

  expect(registrationId).toBeDefined()
})

test('due Attività a fasce sovrapposte restano rifiutate', async () => {
  const t = createTestApp()
  const { eventId, event } = await createEvent(
    t,
    buildEventInput(
      [{ ...VISITA, freeAccess: false, slotDurationMinutes: 120 }, LABORATORIO],
      { allowOverlap: false },
    ),
  )

  // Stessa geometria del test precedente, senza il flag: l'esenzione non deve
  // aver disattivato la regola per tutti.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'mario@example.com',
      children: [],
      companions: [],
      selections: [selection(event.activities[0]), selection(event.activities[1])],
    }),
  ).rejects.toThrow('slot che si sovrappongono')
})

test('«tutte obbligatorie» non pretende la visita libera', async () => {
  const t = createTestApp()
  const { eventId, event } = await createEvent(
    t,
    buildEventInput([VISITA, LABORATORIO], { activityPolicy: 'all' }),
  )

  // Solo il laboratorio: la policy conta le Attività a fasce, quindi il
  // «non mi interessa» sulla visita resta una risposta valida.
  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [selection(event.activities[1])],
  })

  expect(registrationId).toBeDefined()
})

test('con la sola visita libera nessuna policy ha referente', async () => {
  const t = createTestApp()
  const { eventId } = await createEvent(
    t,
    buildEventInput([VISITA], { activityPolicy: 'free' }),
  )

  // Zero selezioni: «seleziona almeno un'attività» non può essere chiesto a
  // chi ha davanti solo un accesso libero.
  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [],
  })

  expect(registrationId).toBeDefined()
})

test('nessun tetto: la visita libera accoglie più Persone di una capienza', async () => {
  const t = createTestApp()
  const { eventId, event } = await createEvent(t, buildEventInput([VISITA]))
  const visita = event.activities[0]

  for (let i = 0; i < 12; i++) {
    await t.mutation(api.registrations.register, {
      eventId,
      userFirstName: `Persona`,
      userLastName: `${i}`,
      contactEmail: `persona${i}@example.com`,
      children: [],
      companions: [],
      selections: [selection(visita)],
    })
  }

  // Dodici iscritti su una capienza nominale di 10: il tetto non esiste.
  const pubblico = await t.query(api.events.getPublic, { eventId })
  expect(pubblico?.activities[0].slots[0].taken).toBe(12)
  expect(pubblico?.soldOut).toBe(false)
})

/* ------------------------------------------------------------------ */
/* Consenso all'informativa (ADR 0012)                                 */
/* ------------------------------------------------------------------ */

const INFORMATIVA = 'Ho letto e accetto l’informativa sul trattamento dei dati personali.'

test('senza informativa sull’Evento non viene chiesto nulla', async () => {
  const t = createTestApp()
  const { eventId } = await createEvent(t, buildEventInput([]))

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [],
  })

  const stored = await t.run((ctx) => ctx.db.get(registrationId))
  expect(stored?.privacyNoticeAccepted).toBeUndefined()
})

test('con informativa la mutation rifiuta la Prenotazione senza consenso', async () => {
  const t = createTestApp()
  const { eventId } = await createEvent(
    t,
    buildEventInput([], { privacyNotice: INFORMATIVA }),
  )

  // Il rifiuto vive qui, non nel bottone disabilitato: `register` è pubblica.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'mario@example.com',
      children: [],
      companions: [],
      selections: [],
    }),
  ).rejects.toThrow('informativa')
})

test('la Prenotazione si porta dietro il testo accettato', async () => {
  const t = createTestApp()
  const { eventId, asAdmin } = await createEvent(
    t,
    buildEventInput([], { privacyNotice: INFORMATIVA }),
  )

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [],
    privacyAccepted: true,
  })

  // L'admin riscrive l'informativa: ciò che è già stato accettato non cambia.
  await asAdmin.mutation(api.events.update, {
    eventId,
    ...buildEventInput([], { privacyNotice: 'Informativa nuova, del mese dopo.' }),
  })

  const stored = await t.run((ctx) => ctx.db.get(registrationId))
  expect(stored?.privacyNoticeAccepted).toBe(INFORMATIVA)
})

test('anche la Rinuncia rifiuta senza consenso e conserva il testo', async () => {
  const t = createTestApp()
  const { eventId } = await createEvent(
    t,
    buildEventInput([], { confirmParticipation: true, privacyNotice: INFORMATIVA }),
  )

  await expect(
    t.mutation(api.declines.decline, {
      eventId,
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'mario@example.com',
    }),
  ).rejects.toThrow('informativa')

  const { id } = await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
    privacyAccepted: true,
  })

  const stored = await t.run((ctx) => ctx.db.get(id))
  expect(stored?.privacyNoticeAccepted).toBe(INFORMATIVA)
})
