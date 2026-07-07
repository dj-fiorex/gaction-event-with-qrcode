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

test('accounts.list excludes members, shows admin and staff only', async () => {
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

  // Admin and legacy-staff appear.
  expect(accounts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: adminId, role: 'admin' }),
      expect.objectContaining({ id: legacyId, role: 'staff' }),
    ]),
  )
  // Members are excluded.
  expect(accounts.map((a) => a.id)).not.toContain(memberId)
})

test('accounts.signUpMember always creates a member account', async () => {
  const t = convexTest(schema, modules)
  const { userId } = await t.action(api.accounts.signUpMember, {
    email: 'new@example.com',
    password: 'password123',
    name: 'Nuovo Membro',
  })

  const user = await t.run((ctx) => ctx.db.get(userId as Id<'users'>))
  expect(user?.role).toBe('member')
  expect(user?.email).toBe('new@example.com')
  expect(user?.name).toBe('Nuovo Membro')
})

test('accounts.signUpMember rejects duplicate email', async () => {
  const t = convexTest(schema, modules)
  await t.action(api.accounts.signUpMember, {
    email: 'dupe@example.com',
    password: 'password123',
    name: 'Primo',
  })

  await expect(
    t.action(api.accounts.signUpMember, {
      email: 'dupe@example.com',
      password: 'password456',
      name: 'Secondo',
    }),
  ).rejects.toThrow('Esiste già un account con questa email')
})
