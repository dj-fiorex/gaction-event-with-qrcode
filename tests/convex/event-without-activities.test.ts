/// <reference types="vite/client" />

/**
 * Evento senza Attività (ADR 0010, issue #46): forma legittima e permanente
 * dell'Evento, non uno stato di bozza. È pubblico e prenotabile come ogni
 * altro, non ha tetto di posti — la capienza è un concetto dello Slot — e
 * nessuna delle regole di selezione ha un referente su cui applicarsi.
 */

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

/** `convexTest` legato allo schema di questo progetto: senza, gli indici delle tabelle non si tipizzano. */
function createTestApp() {
  return convexTest(schema, modules)
}
type TestApp = ReturnType<typeof createTestApp>

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createAdmin(t: TestApp) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    }),
  )
}

interface ActivityInput {
  title: string
  start: string
  end: string
  slotDurationMinutes: number
  capacityPerSlot: number
}

const LABORATORIO: ActivityInput = {
  title: 'Laboratorio',
  start: '2026-07-07T09:00',
  end: '2026-07-07T10:00',
  slotDurationMinutes: 60,
  capacityPerSlot: 10,
}

function buildEventInput(
  activities: ActivityInput[],
  overrides: Partial<{
    activityPolicy: 'all' | 'min' | 'free'
    minActivities: number
    recordExit: boolean
  }> = {},
) {
  return {
    title: 'Cena aziendale',
    description: 'Descrizione abbastanza lunga',
    location: 'Roma',
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

/* ------------------------------------------------------------------ */
/* Creazione e forma dell'Evento                                       */
/* ------------------------------------------------------------------ */

test('un Evento si crea senza Attività ed è pubblico come ogni altro', async () => {
  const t = createTestApp()
  const adminId = await createAdmin(t)

  const { id: eventId } = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.events.create, buildEventInput([]))

  const event = await t.query(api.events.getPublic, { eventId })
  expect(event?.activities).toEqual([])
  // Nessuno Slot, quindi nessun tetto: non è «Esaurito», e i totali sono zero
  // perché non c'è nulla da contare (le superfici pubbliche tacciono sui posti).
  expect(event?.soldOut).toBe(false)
  expect(event?.totalCapacity).toBe(0)
})

test('senza Attività policy e minimo sono normalizzati a free/0', async () => {
  const t = createTestApp()
  const adminId = await createAdmin(t)

  const { id: eventId } = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(
      api.events.create,
      buildEventInput([], { activityPolicy: 'min', minActivities: 3 }),
    )

  const stored = await t.run((ctx) => ctx.db.get(eventId))
  expect(stored?.activityPolicy).toBe('free')
  expect(stored?.minActivities).toBe(0)
})

test('con Attività presenti il minimo resta vincolato al loro numero', async () => {
  const t = createTestApp()
  const adminId = await createAdmin(t)

  await expect(
    t
      .withIdentity({ subject: subjectFor(adminId) })
      .mutation(
        api.events.create,
        buildEventInput([LABORATORIO], { activityPolicy: 'min', minActivities: 3 }),
      ),
  ).rejects.toThrow('Il minimo di attività deve essere tra 1 e il numero di attività')
})

test('togliere l’ultima Attività cancella le selezioni ma non le Prenotazioni', async () => {
  const t = createTestApp()
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(
    api.events.create,
    buildEventInput([LABORATORIO]),
  )
  const created = await asAdmin.query(api.events.getForAdmin, { eventId })
  const activity = created!.activities[0]

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [
      { activityId: activity.id as Id<'activities'>, slotId: activity.slots[0].id as Id<'slots'> },
    ],
  })

  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput([]) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  expect(updated?.activities).toEqual([])

  // «Si cancella l'impegno, non il fatto» (ADR 0008): sparisce la selezione,
  // restano Prenotazione, Persone e biglietti.
  const selections = await t.run((ctx) =>
    ctx.db
      .query('slotSelections')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(selections).toEqual([])
  expect(await t.run((ctx) => ctx.db.get(registrationId))).not.toBeNull()
  expect(updated?.personsCount).toBe(1)
})

/* ------------------------------------------------------------------ */
/* Registrazione                                                       */
/* ------------------------------------------------------------------ */

test('la Registrazione senza selezioni riesce su un Evento senza Attività', async () => {
  const t = createTestApp()
  const adminId = await createAdmin(t)

  const { id: eventId } = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.events.create, buildEventInput([]))

  const result = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [],
  })

  expect(result.persons).toHaveLength(1)
  expect(result.persons[0].ticketCode).toMatch(/^TCK-/)
})

test('con Attività presenti la policy free rifiuta ancora zero selezioni', async () => {
  const t = createTestApp()
  const adminId = await createAdmin(t)

  const { id: eventId } = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.events.create, buildEventInput([LABORATORIO]))

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
  ).rejects.toThrow('Seleziona almeno un’attività')
})

/* ------------------------------------------------------------------ */
/* Check-in: l'Ingresso e l'Uscita non dipendono dalle Attività        */
/* ------------------------------------------------------------------ */

test('ingresso, uscita e «Solo verifica» funzionano senza Attività', async () => {
  const t = createTestApp()
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(
    api.events.create,
    buildEventInput([], { recordExit: true }),
  )
  const registration = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [],
  })
  const code = registration.persons[0].ticketCode

  const entry = await asAdmin.mutation(api.checkins.checkIn, { eventId, code, mode: 'event' })
  expect(entry.status).toBe('event-valid')

  const exit = await asAdmin.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit' })
  expect(exit.status).toBe('exit-valid')

  const lookup = await asAdmin.query(api.checkins.lookup, { eventId, code })
  expect(lookup.status).toBe('lookup')
  expect(lookup.personStatus?.entry.at).toBe(entry.at)
  expect(lookup.personStatus?.exit.at).toBe(exit.at)
  // La Visita non è mai avvenuta e non poteva: non c'è nessuna Attività.
  expect(lookup.personStatus?.activity.at).toBeNull()
})
