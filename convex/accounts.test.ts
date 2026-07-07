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

test('accounts.me returns member for an explicit member account', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'member@example.com',
      name: 'Mario Rossi',
      role: 'member',
    }),
  )

  const me = await t.withIdentity({ subject: subjectFor(userId) }).query(api.accounts.me, {})

  expect(me).toMatchObject({
    id: userId,
    email: 'member@example.com',
    name: 'Mario Rossi',
    role: 'member',
  })
})

test('accounts.me falls back to staff when the role is absent', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'legacy@example.com',
      name: 'Legacy Staff',
    }),
  )

  const me = await t.withIdentity({ subject: subjectFor(userId) }).query(api.accounts.me, {})

  expect(me).toMatchObject({
    id: userId,
    role: 'staff',
  })
})

test('accounts.list accepts member rows and preserves the legacy staff fallback', async () => {
  const t = convexTest(schema, modules)
  const { adminId, memberId, legacyId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert('users', {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    }),
    memberId: await ctx.db.insert('users', {
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
    }),
    legacyId: await ctx.db.insert('users', {
      email: 'legacy@example.com',
      name: 'Legacy',
    }),
  }))

  const accounts = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.accounts.list, {})

  expect(accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: adminId,
        role: 'admin',
      }),
      expect.objectContaining({
        id: memberId,
        role: 'member',
      }),
      expect.objectContaining({
        id: legacyId,
        role: 'staff',
      }),
    ]),
  )
})
