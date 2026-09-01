/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  EMAIL_ALREADY_DECLINED_ERROR,
  EMAIL_ALREADY_REGISTERED_ERROR,
} from '../../convex/model'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createUser(
  t: ReturnType<typeof convexTest>,
  { email, role }: { email: string; role: 'admin' | 'staff' | 'member' },
) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email,
      name: `${role} user`,
      role,
      emailVerificationTime: Date.now(),
    }),
  )
}

async function createEventFixture(
  t: ReturnType<typeof convexTest>,
  { confirmParticipation = true }: { confirmParticipation?: boolean } = {},
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
      allowQrReuse: false,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
      confirmParticipation,
    })
    const activityId = await ctx.db.insert('activities', {
      eventId,
      title: 'Laboratorio',
      start: '2026-07-07T09:00:00.000Z',
      end: '2026-07-07T10:00:00.000Z',
      slotDurationMinutes: 60,
      capacityPerSlot: 10,
      order: 0,
    })
    const slotId = await ctx.db.insert('slots', {
      eventId,
      activityId,
      start: '2026-07-07T09:00:00.000Z',
      end: '2026-07-07T10:00:00.000Z',
      capacity: 10,
      order: 0,
    })
    return { eventId, activityId, slotId }
  })
}

/* ------------------------------------------------------------------ */
/* decline: flag gate                                                  */
/* ------------------------------------------------------------------ */

test('decline rejects when the event does not have confirmParticipation enabled', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t, { confirmParticipation: false })

  await expect(
    t.mutation(api.declines.decline, {
      eventId,
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'mario@example.com',
    }),
  ).rejects.toThrow('Questo evento non richiede la conferma di partecipazione')
})

/* ------------------------------------------------------------------ */
/* decline: stores a Rinuncia with no Persone/capacity/QR impact        */
/* ------------------------------------------------------------------ */

test('decline stores only name and email, creates no Persone and occupies no capacity', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.mutation(api.declines.decline, {
    eventId,
    firstName: '  Mario ',
    lastName: ' Rossi  ',
    email: 'Mario@Example.com ',
  })

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(1)
  // Nome e cognome in due colonne (ADR 0017), entrambi obbligatori e ripuliti
  // degli spazi: chi rinuncia dichiara sempre il proprio nome.
  expect(declines[0]).toMatchObject({
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  const persons = await t.run((ctx) => ctx.db.query('persons').collect())
  const registrations = await t.run((ctx) => ctx.db.query('registrations').collect())
  const selections = await t.run((ctx) => ctx.db.query('slotSelections').collect())
  expect(persons).toHaveLength(0)
  expect(registrations).toHaveLength(0)
  expect(selections).toHaveLength(0)

  // Full capacity remains available: a real registration for the same slot still fits entirely.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Altra',
      userLastName: 'Persona',
      contactEmail: 'other@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ eventTitle: 'Evento aziendale' })
})

/* ------------------------------------------------------------------ */
/* one response per email (ADR 0005): repeated «no» is blocked          */
/* ------------------------------------------------------------------ */

test('a second decline from the same normalized email is blocked and keeps the first Rinuncia', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)

  await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })
  await expect(
    t.mutation(api.declines.decline, {
      eventId,
      firstName: 'Mario',
      lastName: 'R.',
      email: '  MARIO@EXAMPLE.COM',
    }),
  ).rejects.toThrow(EMAIL_ALREADY_DECLINED_ERROR)

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(1)
  expect(declines[0]).toMatchObject({
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })
})

/* ------------------------------------------------------------------ */
/* one response per email (ADR 0005): «sì» after «no» is blocked        */
/* ------------------------------------------------------------------ */

test('registering with an email that has a Rinuncia on that event is blocked and stores nothing', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'Mario@Example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow(EMAIL_ALREADY_DECLINED_ERROR)

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(1)
  const registrations = await t.run((ctx) => ctx.db.query('registrations').collect())
  expect(registrations).toHaveLength(0)
})

test('registering does not affect a Rinuncia belonging to a different email', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Altra',
    lastName: 'Persona',
    email: 'altra@example.com',
  })

  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(1)
  expect(declines[0]).toMatchObject({ email: 'altra@example.com' })
})

test('a Rinuncia on one event survives a same-email registration on a different event', async () => {
  const t = convexTest(schema, modules)
  const { eventId: eventA } = await createEventFixture(t)
  const { eventId: eventB, activityId, slotId } = await createEventFixture(t)

  await t.mutation(api.declines.decline, {
    eventId: eventA,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  await t.mutation(api.registrations.register, {
    eventId: eventB,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const declinesForA = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventA))
      .collect(),
  )
  expect(declinesForA).toHaveLength(1)
  expect(declinesForA[0]).toMatchObject({ email: 'mario@example.com' })
})

/* ------------------------------------------------------------------ */
/* decline is blocked when the email already has a Prenotazione         */
/* ------------------------------------------------------------------ */

test('declining with an email that already has a Prenotazione throws the block message and stores nothing', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  await expect(
    t.mutation(api.declines.decline, {
      eventId,
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'Mario@Example.com',
    }),
  ).rejects.toThrow(EMAIL_ALREADY_REGISTERED_ERROR)

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(0)
})

/* ------------------------------------------------------------------ */
/* decline uses the member account email, not the typed one             */
/* ------------------------------------------------------------------ */

test('a logged-in member declines with the account email regardless of the typed one', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, { email: 'member@example.com', role: 'member' })
  const { eventId } = await createEventFixture(t)

  await t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'typed@example.com',
  })

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(1)
  expect(declines[0]).toMatchObject({ email: 'member@example.com' })
})

test('a member with a Prenotazione cannot decline even by typing a different email', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, { email: 'member@example.com', role: 'member' })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'whatever@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  await expect(
    t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.declines.decline, {
      eventId,
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'different@example.com',
    }),
  ).rejects.toThrow(EMAIL_ALREADY_REGISTERED_ERROR)

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(0)
})

/* ------------------------------------------------------------------ */
/* declines.remove (admin): the remedy that frees the email             */
/* ------------------------------------------------------------------ */

test('declines.remove rejects non-admin and anonymous callers', async () => {
  const t = convexTest(schema, modules)
  const staffId = await createUser(t, { email: 'staff@example.com', role: 'staff' })
  const { eventId } = await createEventFixture(t)

  const { id: declineId } = await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  await expect(t.mutation(api.declines.remove, { declineId })).rejects.toThrow('Non autenticato')
  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).mutation(api.declines.remove, { declineId }),
  ).rejects.toThrow('Accesso riservato agli amministratori')
})

test('declines.remove deletes the Rinuncia and frees the email to register again', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin' })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { id: declineId } = await t.mutation(api.declines.decline, {
    eventId,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario@example.com',
  })

  await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.declines.remove, { declineId })

  const declines = await t.run((ctx) =>
    ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
      .collect(),
  )
  expect(declines).toHaveLength(0)

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'mario@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ contactEmail: 'mario@example.com' })
})

/* ------------------------------------------------------------------ */
/* declines.list (admin)                                               */
/* ------------------------------------------------------------------ */

test('declines.list rejects non-admin and anonymous callers', async () => {
  const t = convexTest(schema, modules)
  const staffId = await createUser(t, { email: 'staff@example.com', role: 'staff' })
  const { eventId } = await createEventFixture(t)

  await expect(t.query(api.declines.list, { eventId })).rejects.toThrow('Non autenticato')
  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).query(api.declines.list, { eventId }),
  ).rejects.toThrow('Accesso riservato agli amministratori')
})

test('declines.list returns the count and list for an event, scoped correctly', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin' })
  const { eventId: eventA } = await createEventFixture(t)
  const { eventId: eventB } = await createEventFixture(t)

  await t.mutation(api.declines.decline, { eventId: eventA, firstName: 'A1', lastName: 'Test',
 email: 'a1@example.com' })
  await t.mutation(api.declines.decline, { eventId: eventA, firstName: 'A2', lastName: 'Test',
 email: 'a2@example.com' })
  await t.mutation(api.declines.decline, { eventId: eventB, firstName: 'B1', lastName: 'Test',
 email: 'b1@example.com' })

  const forEventA = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.declines.list, { eventId: eventA })
  expect(forEventA).toHaveLength(2)
  expect(forEventA.map((d) => d.email).sort()).toEqual(['a1@example.com', 'a2@example.com'])

  const all = await t.withIdentity({ subject: subjectFor(adminId) }).query(api.declines.list, {})
  expect(all).toHaveLength(3)
})
