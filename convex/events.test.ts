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
