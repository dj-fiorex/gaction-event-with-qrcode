/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createAdmin(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    }),
  )
}

async function createStaff(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'staff@example.com',
      name: 'Staff',
      role: 'staff',
    }),
  )
}

interface FixtureOptions {
  recordExit?: boolean
  allowQrReuse?: boolean
  /** Se valorizzato, la Persona risulta già entrata all'Evento a questo istante. */
  enteredAt?: string | null
  checkInAccess?: 'private' | 'password'
}

/**
 * Evento in modalità password (operabile con unlockToken) con una Prenotazione
 * di una singola Persona. `enteredAt` simula l'ingresso già registrato.
 */
async function createFixture(
  t: ReturnType<typeof convexTest>,
  {
    recordExit = true,
    allowQrReuse = false,
    enteredAt = null,
    checkInAccess = 'password',
  }: FixtureOptions = {},
) {
  return t.run(async (ctx) => {
    const eventId = await ctx.db.insert('events', {
      title: 'Evento aziendale',
      description: 'Descrizione',
      location: 'Milano',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess,
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: 'unlock-token',
      recordExit,
    })
    const registrationId = await ctx.db.insert('registrations', {
      eventId,
      contactEmail: 'mario@example.com',
      source: 'form',
    })
    const personId = await ctx.db.insert('persons', {
      registrationId,
      eventId,
      firstName: 'Mario',
      lastName: 'Rossi',
      nameProvided: true,
      category: 'user',
      age: null,
      ticketCode: 'TCK-TEST-0001',
      eventCheckInAt: enteredAt,
      eventCheckInCount: enteredAt ? 1 : 0,
      eventCheckInLastAt: enteredAt,
    })
    return { eventId, personId, code: 'TCK-TEST-0001' }
  })
}

const UNLOCK = { unlockToken: 'unlock-token' }

/* ------------------------------------------------------------------ */
/* Uscita: registrazione                                               */
/* ------------------------------------------------------------------ */

test('an exit scan on an entered Persona records first exit time and count', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId, code } = await createFixture(t, {
    enteredAt: '2026-07-07T09:00:00.000Z',
  })

  const result = await t.mutation(api.checkins.checkIn, {
    eventId,
    code,
    mode: 'exit',
    ...UNLOCK,
  })

  expect(result.status).toBe('exit-valid')
  expect(result.count).toBe(1)
  expect(result.at).toBeDefined()

  const person = await t.run((ctx) => ctx.db.get(personId))
  expect(person?.eventCheckOutAt).toBe(result.at)
  expect(person?.eventCheckOutCount).toBe(1)
  expect(person?.eventCheckOutLastAt).toBe(result.at)
  // L'ingresso non viene toccato dall'uscita.
  expect(person?.eventCheckInAt).toBe('2026-07-07T09:00:00.000Z')
  expect(person?.eventCheckInCount).toBe(1)
})

/* ------------------------------------------------------------------ */
/* Uscita: guard rail «Non risulta entrato»                            */
/* ------------------------------------------------------------------ */

test('an exit scan on a Persona with no event entry is blocked and persists nothing', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId, code } = await createFixture(t, { enteredAt: null })

  const result = await t.mutation(api.checkins.checkIn, {
    eventId,
    code,
    mode: 'exit',
    ...UNLOCK,
  })

  expect(result.status).toBe('exit-not-entered')
  expect(result.message).toContain('Non risulta entrato')
  expect(result.person?.ticketCode).toBe(code)

  const person = await t.run((ctx) => ctx.db.get(personId))
  expect(person?.eventCheckOutAt).toBeUndefined()
  expect(person?.eventCheckOutCount).toBeUndefined()
  expect(person?.eventCheckOutLastAt).toBeUndefined()
  expect(person?.eventCheckInAt).toBeNull()
  expect(person?.eventCheckInCount).toBe(0)
})

/* ------------------------------------------------------------------ */
/* Ri-uscite: stessa regola del riuso QR dei rientri                   */
/* ------------------------------------------------------------------ */

test('with riuso QR off, a second exit returns the already-recorded outcome without changing state', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId, code } = await createFixture(t, {
    allowQrReuse: false,
    enteredAt: '2026-07-07T09:00:00.000Z',
  })

  const first = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })
  const second = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  expect(first.status).toBe('exit-valid')
  expect(second.status).toBe('exit-already')
  expect(second.at).toBe(first.at)
  expect(second.count).toBe(1)

  const person = await t.run((ctx) => ctx.db.get(personId))
  expect(person?.eventCheckOutAt).toBe(first.at)
  expect(person?.eventCheckOutLastAt).toBe(first.at)
  expect(person?.eventCheckOutCount).toBe(1)
})

test('with riuso QR on, repeated exits increment the count and update the last exit time', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId, code } = await createFixture(t, {
    allowQrReuse: true,
    enteredAt: '2026-07-07T09:00:00.000Z',
  })

  const first = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })
  // Sentinella: due scansioni consecutive cadono nello stesso millisecondo, quindi
  // un confronto sugli orari non proverebbe che lastAt viene riscritto.
  const SENTINEL = '2000-01-01T00:00:00.000Z'
  await t.run((ctx) => ctx.db.patch(personId, { eventCheckOutLastAt: SENTINEL }))

  const second = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  expect(second.status).toBe('exit-valid')
  expect(second.count).toBe(2)
  expect(second.message).toContain('2')
  // `at` resta la prima uscita: mirror del comportamento dei rientri.
  expect(second.at).toBe(first.at)

  const person = await t.run((ctx) => ctx.db.get(personId))
  expect(person?.eventCheckOutAt).toBe(first.at)
  expect(person?.eventCheckOutCount).toBe(2)
  expect(person?.eventCheckOutLastAt).not.toBe(SENTINEL)
  expect(person?.eventCheckOutLastAt! >= first.at!).toBe(true)
})

/* ------------------------------------------------------------------ */
/* Flag «Registra l'uscita» disattivo                                  */
/* ------------------------------------------------------------------ */

test('an exit scan on an event without Registrazione dell’uscita is refused and persists nothing', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId, code } = await createFixture(t, {
    recordExit: false,
    enteredAt: '2026-07-07T09:00:00.000Z',
  })

  const result = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  expect(result.status).toBe('exit-disabled')

  const person = await t.run((ctx) => ctx.db.get(personId))
  expect(person?.eventCheckOutAt).toBeUndefined()
  expect(person?.eventCheckOutCount).toBeUndefined()
})

test('a legacy event without the recordExit field refuses exit scans', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t, { enteredAt: '2026-07-07T09:00:00.000Z' })
  await t.run((ctx) => ctx.db.patch(eventId, { recordExit: undefined }))

  const result = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  expect(result.status).toBe('exit-disabled')
})

/* ------------------------------------------------------------------ */
/* Autorizzazione operatore                                            */
/* ------------------------------------------------------------------ */

test('an exit scan without the operator authorization is rejected', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t, { enteredAt: '2026-07-07T09:00:00.000Z' })

  await expect(
    t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit' }),
  ).rejects.toThrow('Accesso non autorizzato')

  await expect(
    t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', unlockToken: 'sbagliato' }),
  ).rejects.toThrow('Accesso non autorizzato')
})

test('admin and staff can run an exit scan on a password event without an unlock token', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const { eventId, code } = await createFixture(t, {
    allowQrReuse: true,
    enteredAt: '2026-07-07T09:00:00.000Z',
  })

  const asAdmin = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.checkins.checkIn, { eventId, code, mode: 'exit' })
  const asStaff = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .mutation(api.checkins.checkIn, { eventId, code, mode: 'exit' })

  expect(asAdmin.status).toBe('exit-valid')
  expect(asStaff.status).toBe('exit-valid')
})

test('on a private event only an assigned Assistente can run an exit scan', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const { eventId, code } = await createFixture(t, {
    checkInAccess: 'private',
    allowQrReuse: true,
    enteredAt: '2026-07-07T09:00:00.000Z',
  })

  // Assistente non associato all'Evento: rifiutato.
  await expect(
    t
      .withIdentity({ subject: subjectFor(staffId) })
      .mutation(api.checkins.checkIn, { eventId, code, mode: 'exit' }),
  ).rejects.toThrow('Accesso non autorizzato')

  // L'admin opera sempre qualsiasi Evento.
  const asAdmin = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.checkins.checkIn, { eventId, code, mode: 'exit' })
  expect(asAdmin.status).toBe('exit-valid')

  // Dopo l'associazione, lo stesso Assistente passa.
  await t.run((ctx) => ctx.db.insert('eventStaff', { eventId, userId: staffId }))
  const asStaff = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .mutation(api.checkins.checkIn, { eventId, code, mode: 'exit' })
  expect(asStaff.status).toBe('exit-valid')
})

/* ------------------------------------------------------------------ */
/* Impostazione per-Evento                                             */
/* ------------------------------------------------------------------ */

function buildEventInput() {
  return {
    title: 'Evento test',
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
    collectNotes: false,
    recordExit: false,
    allowChildren: false,
    maxChildrenPerRegistration: 0,
    allowCompanions: false,
    maxCompanionsPerRegistration: 0,
    checkInAccess: 'private' as const,
    checkInPassword: '',
    activities: [
      {
        title: 'Laboratorio',
        start: '2026-07-07T09:00',
        end: '2026-07-07T10:00',
        slotDurationMinutes: 60,
        capacityPerSlot: 10,
      },
    ],
  }
}

test('events.create defaults recordExit off and can persist it on', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const off = await asAdmin.mutation(api.events.create, buildEventInput())
  const on = await asAdmin.mutation(api.events.create, {
    ...buildEventInput(),
    recordExit: true,
  })

  expect((await t.query(api.events.getPublic, { eventId: off.id }))?.recordExit).toBe(false)
  expect((await t.query(api.events.getPublic, { eventId: on.id }))?.recordExit).toBe(true)
})

test('events.update can toggle recordExit on and back off', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(api.events.create, buildEventInput())

  await asAdmin.mutation(api.events.update, {
    eventId,
    ...buildEventInput(),
    recordExit: true,
  })
  expect((await t.query(api.events.getPublic, { eventId }))?.recordExit).toBe(true)

  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput() })
  expect((await t.query(api.events.getPublic, { eventId }))?.recordExit).toBe(false)
})
