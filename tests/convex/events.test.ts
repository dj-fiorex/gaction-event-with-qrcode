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
