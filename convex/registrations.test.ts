/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createUser(
  t: ReturnType<typeof convexTest>,
  {
    email,
    role,
    verified = false,
  }: {
    email: string
    role: 'admin' | 'staff' | 'member'
    verified?: boolean
  },
) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email,
      name: `${role} user`,
      role,
      ...(verified ? { emailVerificationTime: Date.now() } : {}),
    }),
  )
}

async function createEventFixture(
  t: ReturnType<typeof convexTest>,
  {
    requireAccount = false,
    embedEnabled = false,
    allowChildren = false,
    allowCompanions = false,
  }: {
    requireAccount?: boolean
    embedEnabled?: boolean
    allowChildren?: boolean
    allowCompanions?: boolean
  } = {},
) {
  return t.run(async (ctx) => {
    const eventId = await ctx.db.insert('events', {
      title: 'Evento test',
      description: 'Descrizione',
      location: 'Roma',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren,
      maxChildrenPerRegistration: allowChildren ? 2 : 0,
      allowCompanions,
      maxCompanionsPerRegistration: allowCompanions ? 2 : 0,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
      embedEnabled,
      requireAccount,
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

async function registrationsForEvent(
  t: ReturnType<typeof convexTest>,
  eventId: Id<'events'>,
) {
  return t.run((ctx) =>
    ctx.db
      .query('registrations')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect(),
  )
}

test('register rejects anonymous callers when the event requires a verified member account', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { requireAccount: true })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Per registrarti a questo evento devi accedere con un account Membro verificato')
})

test('register rejects unverified members when the event requires a verified member account', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, { requireAccount: true })

  await expect(
    t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Verifica la tua email prima di registrarti a questo evento')
})

test('register rejects non-member callers when the event requires a verified member account', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { requireAccount: true })
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const staffId = await createUser(t, { email: 'staff@example.com', role: 'staff', verified: true })

  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Admin',
      contactEmail: 'admin+guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Solo i Membri verificati possono registrarsi a questo evento')

  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Staff',
      contactEmail: 'staff+guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Solo i Membri verificati possono registrarsi a questo evento')
})

test('register rejects embedded registrations when requireAccount is enabled', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    requireAccount: true,
    embedEnabled: true,
  })

  await expect(
    t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
      embed: true,
    }),
  ).rejects.toThrow(
    'Questo evento richiede un account Membro verificato: completa la registrazione dal sito principale',
  )
})

test('register links the verified member, locks contactEmail, and still allows children and companions', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    requireAccount: true,
    allowChildren: true,
    allowCompanions: true,
  })

  const result = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [{ name: 'Figlio', age: 7 }],
      companions: [{ name: 'Accompagnatore' }],
      selections: [{ activityId, slotId }],
    })

  const [registration] = await registrationsForEvent(t, eventId)
  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', result.registrationId))
      .collect(),
  )

  expect(registration).toMatchObject({
    eventId,
    userId: memberId,
    contactEmail: 'member@example.com',
  })
  expect(result.contactEmail).toBe('member@example.com')
  expect(persons.map((person) => person.category)).toEqual(['user', 'child', 'companion'])
})

test('register links authenticated callers on anonymous events and locks contactEmail for members', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.register, {
    eventId,
    userName: 'Mario Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.register, {
    eventId,
    userName: 'Admin User',
    contactEmail: 'typed@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const registrations = await registrationsForEvent(t, eventId)
  expect(registrations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        userId: memberId,
        contactEmail: 'member@example.com',
      }),
      expect.objectContaining({
        userId: adminId,
        contactEmail: 'typed@example.com',
      }),
    ]),
  )
})

test('register keeps the anonymous flow unchanged and never links ownership by contactEmail', async () => {
  const t = convexTest(schema, modules)
  await createUser(t, {
    email: 'same@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const result = await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Guest',
    contactEmail: 'same@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const [registration] = await registrationsForEvent(t, eventId)

  expect(result.contactEmail).toBe('same@example.com')
  expect(registration).toMatchObject({
    eventId,
    contactEmail: 'same@example.com',
  })
  expect(registration?.userId).toBeUndefined()
})
