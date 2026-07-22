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

function buildEventInput(requireAccount: boolean) {
  return {
    title: 'Evento test',
    description: 'Descrizione abbastanza lunga',
    location: 'Roma',
    activityPolicy: 'free' as const,
    minActivities: 0,
    allowOverlap: false,
    checkInToleranceMinutes: 15,
    allowQrReuse: false,
    requireAccount,
    confirmParticipation: false,
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

async function createStaff(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'staff@example.com',
      name: 'Staff',
      role: 'staff',
    }),
  )
}

async function createMember(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
      emailVerificationTime: Date.now(),
    }),
  )
}

test('events.create persists requireAccount and exposes it to public queries', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    buildEventInput(true),
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.requireAccount).toBe(true)
  expect(publicEvent?.requireAccount).toBe(true)
})

test('events.update can toggle requireAccount off', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    buildEventInput(true),
  )

  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.update, {
    eventId,
    ...buildEventInput(false),
  })

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.requireAccount).toBe(false)
  expect(publicEvent?.requireAccount).toBe(false)
})

/* ------------------------------------------------------------------ */
/* Regola del nucleo familiare (issue #35)                             */
/* ------------------------------------------------------------------ */

test('events.create persists maxCompanionsWithChildren when Figli and Ospiti are both enabled', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 1,
    },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.maxCompanionsWithChildren).toBe(1)
  expect(publicEvent?.maxCompanionsWithChildren).toBe(1)
})

test('events.create clears maxCompanionsWithChildren when Figli are not enabled, even if sent', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: false,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 1,
    },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.maxCompanionsWithChildren).toBeUndefined()
  expect(publicEvent?.maxCompanionsWithChildren).toBeNull()
})

test('events.create rejects a maxCompanionsWithChildren greater than the base Ospiti cap', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.create, {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 1,
      maxCompanionsWithChildren: 2,
    }),
  ).rejects.toThrow('Il massimo Ospiti con Figli non può superare il massimo Ospiti')
})

test('events.create allows a maxCompanionsWithChildren exactly equal to the base Ospiti cap (boundary)', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 2,
    },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  expect(rawEvent?.maxCompanionsWithChildren).toBe(2)
})

test('events.update clears a previously-set maxCompanionsWithChildren when Ospiti are disabled', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 1,
    },
  )

  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.update, {
    eventId,
    ...buildEventInput(false),
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    allowCompanions: false,
    maxCompanionsPerRegistration: 0,
    maxCompanionsWithChildren: 1,
  })

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  expect(rawEvent?.maxCompanionsWithChildren).toBeUndefined()
})

test('events.listOperable excludes members for password-mode events and includes staff', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const memberId = await createMember(t)

  const created = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      checkInAccess: 'password',
      checkInPassword: '123456',
    },
  )

  const memberOperable = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .query(api.events.listOperable, {})
  const staffOperable = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .query(api.events.listOperable, {})

  expect(memberOperable.map((event) => event.id)).not.toContain(created.id)
  expect(staffOperable.map((event) => event.id)).toContain(created.id)
})

test('checkins.operableEvents excludes members for password-mode events and includes staff', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const memberId = await createMember(t)

  const created = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      checkInAccess: 'password',
      checkInPassword: '123456',
    },
  )

  const memberOperable = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .query(api.checkins.operableEvents, {})
  const staffOperable = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .query(api.checkins.operableEvents, {})

  expect(memberOperable.map((event) => event.id)).not.toContain(created.id)
  expect(staffOperable.map((event) => event.id)).toContain(created.id)
})
