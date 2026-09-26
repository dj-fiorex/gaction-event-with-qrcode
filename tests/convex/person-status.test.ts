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
  checkInAccess?: 'private' | 'password'
  /** Distinto quando un test crea due Eventi: `by_ticketCode` è globale. */
  ticketCode?: string
}

const UNLOCK = { unlockToken: 'unlock-token' }

/**
 * Evento con una Attività (slot in corso, così il check-in di Attività passa)
 * e una Prenotazione di una singola Persona mai scansionata.
 */
async function createFixture(
  t: ReturnType<typeof convexTest>,
  {
    recordExit = true,
    allowQrReuse = true,
    checkInAccess = 'password',
    ticketCode = 'TCK-TEST-0001',
  }: FixtureOptions = {},
) {
  const now = Date.now()
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
      collectAllergies: true,
      recordExit,
    })
    const activityId = await ctx.db.insert('activities', {
      eventId,
      title: 'Visita guidata',
      start: new Date(now - 5 * 60_000).toISOString(),
      end: new Date(now + 55 * 60_000).toISOString(),
      slotDurationMinutes: 60,
      capacityPerSlot: 10,
      order: 0,
    })
    const slotId = await ctx.db.insert('slots', {
      eventId,
      activityId,
      start: new Date(now - 5 * 60_000).toISOString(),
      end: new Date(now + 55 * 60_000).toISOString(),
      capacity: 10,
      order: 0,
    })
    const registrationId = await ctx.db.insert('registrations', {
      eventId,
      contactEmail: 'mario@example.com',
      source: 'form',
    })
    await ctx.db.insert('slotSelections', { registrationId, eventId, activityId, slotId })
    const personId = await ctx.db.insert('persons', {
      registrationId,
      eventId,
      firstName: 'Mario',
      lastName: 'Rossi',
      nameProvided: true,
      category: 'user',
      age: 41,
      allergies: 'Lattosio',
      ticketCode,
      eventCheckInAt: null,
      eventCheckInCount: 0,
      eventCheckInLastAt: null,
    })
    return { eventId, activityId, slotId, personId, code: ticketCode }
  })
}

/** Snapshot dei campi persistiti che una scansione potrebbe alterare. */
async function persistedState(t: ReturnType<typeof convexTest>, personId: Id<'persons'>) {
  return t.run(async (ctx) => {
    const person = await ctx.db.get(personId)
    const activityCheckIns = (await ctx.db.query('activityCheckIns').collect()).filter(
      (c) => c.personId === personId,
    )
    return {
      eventCheckInAt: person?.eventCheckInAt ?? null,
      eventCheckInCount: person?.eventCheckInCount ?? 0,
      eventCheckInLastAt: person?.eventCheckInLastAt ?? null,
      eventCheckOutAt: person?.eventCheckOutAt ?? null,
      eventCheckOutCount: person?.eventCheckOutCount ?? 0,
      eventCheckOutLastAt: person?.eventCheckOutLastAt ?? null,
      activityCheckIns: activityCheckIns.map((c) => ({ at: c.at, count: c.count, lastAt: c.lastAt })),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Stato consolidato sugli esiti di check-in                           */
/* ------------------------------------------------------------------ */

test('an event check-in result carries the consolidated status with only the entry recorded', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t)

  const result = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })

  expect(result.status).toBe('event-valid')
  expect(result.personStatus).toEqual({
    entry: { at: result.at, count: 1, lastAt: result.at },
    activity: { at: null, count: 0, lastAt: null },
    exit: { at: null, count: 0, lastAt: null },
  })
})

test('the consolidated status accumulates the three moments across modes', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, code } = await createFixture(t)

  const entry = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  const activity = await t.mutation(api.checkins.checkIn, {
    eventId,
    code,
    mode: 'activity',
    activityId,
    ...UNLOCK,
  })
  const exit = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  // Ogni esito riporta i momenti già registrati al momento della scansione.
  expect(activity.personStatus?.entry.at).toBe(entry.at)
  expect(activity.personStatus?.activity.at).toBe(activity.at)
  expect(activity.personStatus?.exit.at).toBeNull()

  expect(exit.personStatus).toEqual({
    entry: { at: entry.at, count: 1, lastAt: entry.at },
    activity: { at: activity.at, count: 1, lastAt: activity.at },
    exit: { at: exit.at, count: 1, lastAt: exit.at },
  })
})

test('the consolidated status reports repetitions of every moment', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, code } = await createFixture(t, { allowQrReuse: true })

  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'activity', activityId, ...UNLOCK })
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'activity', activityId, ...UNLOCK })
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })
  const last = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  expect(last.personStatus?.entry.count).toBe(2)
  expect(last.personStatus?.activity.count).toBe(2)
  expect(last.personStatus?.exit.count).toBe(2)
})

test('the consolidated status is present on outcomes that resolve a Persona without writing', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t)

  // Uscita senza ingresso: esito bloccante, ma la Persona è risolta.
  const blocked = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })
  expect(blocked.status).toBe('exit-not-entered')
  expect(blocked.personStatus).toEqual({
    entry: { at: null, count: 0, lastAt: null },
    activity: { at: null, count: 0, lastAt: null },
    exit: { at: null, count: 0, lastAt: null },
  })

})

test('a QR from another Evento gets no consolidated status', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t)
  const other = await createFixture(t, { ticketCode: 'TCK-TEST-0002' })

  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })

  // I tre momenti sono relativi all'Evento della Persona: allegarli qui li
  // farebbe leggere come se riguardassero l'Evento scansionato, e mostrerebbe
  // a chi opera questo Evento la giornata di un iscritto a un altro.
  const wrongEvent = await t.mutation(api.checkins.checkIn, {
    eventId: other.eventId,
    code,
    mode: 'event',
    ...UNLOCK,
  })
  expect(wrongEvent.status).toBe('wrong-event')
  expect(wrongEvent.person?.ticketCode).toBe(code)
  expect(wrongEvent.personStatus).toBeUndefined()

  const lookup = await t.query(api.checkins.lookup, { eventId: other.eventId, code, ...UNLOCK })
  expect(lookup.status).toBe('wrong-event')
  expect(lookup.personStatus).toBeUndefined()
})

test('an unresolved scan carries no consolidated status', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createFixture(t)

  const result = await t.mutation(api.checkins.checkIn, {
    eventId,
    code: 'TCK-NON-ESISTE',
    mode: 'event',
    ...UNLOCK,
  })

  expect(result.status).toBe('not-found')
  expect(result.personStatus).toBeUndefined()
})

/* ------------------------------------------------------------------ */
/* «Solo verifica»: lettura senza scrittura                            */
/* ------------------------------------------------------------------ */

test('the lookup returns the same consolidated status as a check-in', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, code } = await createFixture(t)

  const entry = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  const activity = await t.mutation(api.checkins.checkIn, {
    eventId,
    code,
    mode: 'activity',
    activityId,
    ...UNLOCK,
  })

  const lookup = await t.query(api.checkins.lookup, { eventId, code, ...UNLOCK })

  expect(lookup.status).toBe('lookup')
  expect(lookup.person?.firstName).toBe('Mario')
  expect(lookup.person?.lastName).toBe('Rossi')
  expect(lookup.person?.age).toBe(41)
  expect(lookup.person?.allergies).toBe('Lattosio')
  expect(lookup.eventTitle).toBe('Evento aziendale')
  expect(lookup.personStatus).toEqual({
    entry: { at: entry.at, count: 1, lastAt: entry.at },
    activity: { at: activity.at, count: 1, lastAt: activity.at },
    exit: { at: null, count: 0, lastAt: null },
  })
})

test('the lookup writes nothing: counts and timestamps are unchanged', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, personId, code } = await createFixture(t)

  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'activity', activityId, ...UNLOCK })
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  const before = await persistedState(t, personId)
  await t.query(api.checkins.lookup, { eventId, code, ...UNLOCK })
  await t.query(api.checkins.lookup, { eventId, code, ...UNLOCK })
  const after = await persistedState(t, personId)

  expect(after).toEqual(before)
})

test('the lookup on a never-scanned Persona leaves it never-scanned', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId, code } = await createFixture(t)

  const lookup = await t.query(api.checkins.lookup, { eventId, code, ...UNLOCK })

  expect(lookup.personStatus).toEqual({
    entry: { at: null, count: 0, lastAt: null },
    activity: { at: null, count: 0, lastAt: null },
    exit: { at: null, count: 0, lastAt: null },
  })
  expect(await persistedState(t, personId)).toEqual({
    eventCheckInAt: null,
    eventCheckInCount: 0,
    eventCheckInLastAt: null,
    eventCheckOutAt: null,
    eventCheckOutCount: 0,
    eventCheckOutLastAt: null,
    activityCheckIns: [],
  })
})

test('the lookup resolves unknown and foreign QR codes like a check-in does', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t)
  const other = await createFixture(t, { ticketCode: 'TCK-TEST-0002' })

  const unknown = await t.query(api.checkins.lookup, { eventId, code: 'TCK-NON-ESISTE', ...UNLOCK })
  expect(unknown.status).toBe('not-found')
  expect(unknown.personStatus).toBeUndefined()

  const foreign = await t.query(api.checkins.lookup, { eventId: other.eventId, code, ...UNLOCK })
  expect(foreign.status).toBe('wrong-event')
  expect(foreign.person?.ticketCode).toBe(code)
})

test('the Visita moment merges the accesses to every Attività into one', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId, personId, code } = await createFixture(t)

  // Seconda Attività nella stessa finestra oraria, con la Persona iscritta.
  const secondActivityId = await t.run(async (ctx) => {
    const slot = await ctx.db.get(slotId)
    const person = await ctx.db.get(personId)
    const second = await ctx.db.insert('activities', {
      eventId,
      title: 'Laboratorio',
      start: slot!.start,
      end: slot!.end,
      slotDurationMinutes: 120,
      capacityPerSlot: 20,
      order: 1,
    })
    const secondSlot = await ctx.db.insert('slots', {
      eventId,
      activityId: second,
      start: slot!.start,
      end: slot!.end,
      capacity: 20,
      order: 0,
    })
    await ctx.db.insert('slotSelections', {
      registrationId: person!.registrationId,
      eventId,
      activityId: second,
      slotId: secondSlot,
    })
    return second
  })

  const first = await t.mutation(api.checkins.checkIn, {
    eventId,
    code,
    mode: 'activity',
    activityId,
    ...UNLOCK,
  })
  const second = await t.mutation(api.checkins.checkIn, {
    eventId,
    code,
    mode: 'activity',
    activityId: secondActivityId,
    ...UNLOCK,
  })

  // Un momento solo per l'operatore al varco: la prima visita è la più remota,
  // il contatore somma gli accessi a tutte le Attività (non le ripetizioni
  // della stessa), l'ultima visita è la più recente.
  expect(second.personStatus?.activity.at).toBe(first.at)
  expect(second.personStatus?.activity.count).toBe(2)
  expect(second.personStatus?.activity.lastAt! >= first.at!).toBe(true)
})

/* ------------------------------------------------------------------ */
/* Autorizzazione: stesse regole del check-in                          */
/* ------------------------------------------------------------------ */

test('the lookup rejects callers without the operator authorization', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t)

  await expect(t.query(api.checkins.lookup, { eventId, code })).rejects.toThrow(
    'Accesso non autorizzato',
  )
  await expect(
    t.query(api.checkins.lookup, { eventId, code, unlockToken: 'sbagliato' }),
  ).rejects.toThrow('Accesso non autorizzato')
})

test('admin and staff can run the lookup on a password event without an unlock token', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const { eventId, code } = await createFixture(t)

  const asAdmin = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.checkins.lookup, { eventId, code })
  const asStaff = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .query(api.checkins.lookup, { eventId, code })

  expect(asAdmin.status).toBe('lookup')
  expect(asStaff.status).toBe('lookup')
})

test('on a private event only an assigned Assistente can run the lookup', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const { eventId, code } = await createFixture(t, { checkInAccess: 'private' })

  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).query(api.checkins.lookup, { eventId, code }),
  ).rejects.toThrow('Accesso non autorizzato')

  const asAdmin = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.checkins.lookup, { eventId, code })
  expect(asAdmin.status).toBe('lookup')

  await t.run((ctx) => ctx.db.insert('eventStaff', { eventId, userId: staffId }))
  const asStaff = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .query(api.checkins.lookup, { eventId, code })
  expect(asStaff.status).toBe('lookup')
})

/* ------------------------------------------------------------------ */
/* Stato consolidato per l'admin                                       */
/* ------------------------------------------------------------------ */

test('the admin registration DTO exposes the exit moment alongside the entry', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const { eventId, code } = await createFixture(t)

  const entry = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  const exit = await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })

  const [registration] = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.registrations.listAll, { eventId })
  const person = registration.persons[0]

  expect(person.eventCheckInAt).toBe(entry.at)
  expect(person.eventCheckOutAt).toBe(exit.at)
  expect(person.eventCheckOutCount).toBe(1)
  expect(person.eventCheckOutLastAt).toBe(exit.at)
  expect(person.allergies).toBe('Lattosio')
  expect(person.age).toBe(41)
})

/* ------------------------------------------------------------------ */
/* Presenze dell'Evento                                                */
/* ------------------------------------------------------------------ */

test('the admin DTO tracks presence across entry, exit and re-entry; the public DTO shows zeros', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code } = await createFixture(t, { recordExit: true, allowQrReuse: true })
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })
  const presence = async () => (await asAdmin.query(api.events.getForAdmin, { eventId }))!.presence

  expect(await presence()).toEqual({ entered: 0, inside: 0, exited: 0 })

  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  expect(await presence()).toEqual({ entered: 1, inside: 1, exited: 0 })

  // Lo scanner scrive orari al millisecondo: aspetta un tick per non avere
  // ingresso e uscita nello stesso istante.
  await new Promise((r) => setTimeout(r, 2))
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'exit', ...UNLOCK })
  expect(await presence()).toEqual({ entered: 1, inside: 0, exited: 1 })

  await new Promise((r) => setTimeout(r, 2))
  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  expect(await presence()).toEqual({ entered: 1, inside: 1, exited: 0 })

  const pub = await t.query(api.events.getPublic, { eventId })
  expect(pub!.presence).toEqual({ entered: 0, inside: 0, exited: 0 })
})
