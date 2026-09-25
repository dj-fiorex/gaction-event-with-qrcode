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

/* ------------------------------------------------------------------ */
/* Check-in dall'elenco: la Persona indicata per id, non per QR          */
/* ------------------------------------------------------------------ */

/**
 * Seconda Prenotazione nello stesso Evento: un Utente con un Figlio senza
 * nome dichiarato («Figlio 1») e un Ospite con nome. Serve all'Elenco
 * partecipanti: gruppi, ordine e ricerca.
 */
async function addFamily(t: ReturnType<typeof convexTest>, eventId: Id<'events'>) {
  return t.run(async (ctx) => {
    const registrationId = await ctx.db.insert('registrations', {
      eventId,
      contactEmail: 'anna@example.com',
      source: 'form',
    })
    const base = {
      registrationId,
      eventId,
      eventCheckInAt: null,
      eventCheckInCount: 0,
      eventCheckInLastAt: null,
    }
    const childId = await ctx.db.insert('persons', {
      ...base,
      firstName: 'Figlio 1',
      nameProvided: false,
      category: 'child',
      age: 7,
      ticketCode: 'TCK-TEST-0003',
    })
    const userId = await ctx.db.insert('persons', {
      ...base,
      firstName: 'Anna',
      lastName: 'Bianchi',
      nameProvided: true,
      category: 'user',
      age: null,
      ticketCode: 'TCK-TEST-0002',
    })
    const companionId = await ctx.db.insert('persons', {
      ...base,
      firstName: 'Luca',
      nameProvided: true,
      category: 'companion',
      age: null,
      ticketCode: 'TCK-TEST-0004',
    })
    return { registrationId, userId, childId, companionId }
  })
}

test('checkIn by personId records the entry exactly like a QR scan', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId } = await createFixture(t)

  const result = await t.mutation(api.checkins.checkIn, {
    eventId,
    personId,
    mode: 'event',
    ...UNLOCK,
  })

  expect(result.status).toBe('event-valid')
  expect(result.person?.ticketCode).toBe('TCK-TEST-0001')
  expect(result.personStatus?.entry.count).toBe(1)
  const person = await t.run((ctx) => ctx.db.get(personId))
  expect(person?.eventCheckInAt).toBe(result.at)

  // Il secondo passaggio segue la stessa regola del QR: riuso spento → già registrato.
  const again = await t.mutation(api.checkins.checkIn, {
    eventId,
    personId,
    mode: 'event',
    ...UNLOCK,
  })
  expect(again.status).toBe('event-already')
})

test('lookup by personId reads the Stato consolidato without writing', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId } = await createFixture(t, {
    enteredAt: '2026-07-07T09:00:00.000Z',
  })

  const result = await t.query(api.checkins.lookup, { eventId, personId, ...UNLOCK })

  expect(result.status).toBe('lookup')
  expect(result.personStatus?.entry.at).toBe('2026-07-07T09:00:00.000Z')
  const person = await t.run((ctx) => ctx.db.get(personId))
  expect(person?.eventCheckInCount).toBe(1)
})

test('a personId of another Evento is refused as wrong-event, like a foreign QR', async () => {
  const t = convexTest(schema, modules)
  const { personId } = await createFixture(t)
  const { eventId: otherEventId } = await createFixture(t)

  const result = await t.mutation(api.checkins.checkIn, {
    eventId: otherEventId,
    personId,
    mode: 'event',
    ...UNLOCK,
  })

  expect(result.status).toBe('wrong-event')
  expect(result.personStatus).toBeUndefined()
})

test('checkIn with neither code nor personId is not-found and writes nothing', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createFixture(t)

  const result = await t.mutation(api.checkins.checkIn, { eventId, mode: 'event', ...UNLOCK })

  expect(result.status).toBe('not-found')
})

/* ------------------------------------------------------------------ */
/* Elenco partecipanti                                                  */
/* ------------------------------------------------------------------ */

test('participants groups Persone by Prenotazione, Utente first, sorted by cognome', async () => {
  const t = convexTest(schema, modules)
  const { eventId, personId: marioId } = await createFixture(t, {
    enteredAt: '2026-07-07T09:00:00.000Z',
  })
  const { registrationId, userId, childId, companionId } = await addFamily(t, eventId)

  const groups = await t.query(api.checkins.participants, { eventId, ...UNLOCK })

  expect(groups).toHaveLength(2)
  // Bianchi prima di Rossi.
  expect(groups[0].registrationId).toBe(registrationId)
  expect(groups[0].contactEmail).toBe('anna@example.com')
  expect(groups[0].persons.map((p) => p.personId)).toEqual([userId, childId, companionId])
  expect(groups[0].persons[1]).toMatchObject({
    firstName: 'Figlio 1',
    nameProvided: false,
    category: 'child',
    age: 7,
  })
  expect(groups[0].persons[0].status.entry.at).toBeNull()

  expect(groups[1].persons).toHaveLength(1)
  expect(groups[1].persons[0].personId).toBe(marioId)
  expect(groups[1].persons[0].status.entry.at).toBe('2026-07-07T09:00:00.000Z')
  // Niente allergie nell'elenco: restano nella scheda dell'esito.
  expect('allergies' in groups[1].persons[0]).toBe(false)
})

test('participants requires the same authorization as a check-in', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createFixture(t)

  await expect(t.query(api.checkins.participants, { eventId })).rejects.toThrow(
    'Accesso non autorizzato',
  )
  await expect(
    t.query(api.checkins.participants, { eventId, unlockToken: 'wrong' }),
  ).rejects.toThrow('Accesso non autorizzato')

  const staffId = await createStaff(t)
  const asStaff = t.withIdentity({ subject: subjectFor(staffId) })
  // Evento in modalità password: ogni Assistente loggato può operare.
  expect(await asStaff.query(api.checkins.participants, { eventId })).toHaveLength(1)
})

test('participants reflects a QR check-in on the same row', async () => {
  const t = convexTest(schema, modules)
  const { eventId, code, personId } = await createFixture(t)

  await t.mutation(api.checkins.checkIn, { eventId, code, mode: 'event', ...UNLOCK })
  const groups = await t.query(api.checkins.participants, { eventId, ...UNLOCK })

  const row = groups[0].persons.find((p) => p.personId === personId)
  expect(row?.status.entry.count).toBe(1)
})
