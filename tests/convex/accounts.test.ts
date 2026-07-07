/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

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
    emailVerified: false,
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
    emailVerified: true,
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
  expect(user?.emailVerificationTime).toBeUndefined()

  const verificationCodes = await t.run((ctx) => ctx.db.query('authVerificationCodes').collect())
  expect(verificationCodes).toHaveLength(1)
  expect(verificationCodes[0]?.emailVerified).toBe('new@example.com')
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

test('email verification completion marks the member as verified', async () => {
  const t = convexTest(schema, modules)
  const { userId } = await t.action(api.accounts.signUpMember, {
    email: 'verifyme@example.com',
    password: 'password123',
    name: 'Verifica Me',
  })

  const account = await t.run((ctx) =>
    ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) =>
        q.eq('provider', 'password').eq('providerAccountId', 'verifyme@example.com'),
      )
      .unique(),
  )
  expect(account?._id).toBeTruthy()

  const verificationCode = await t.mutation(internal.emailVerification.issueCodeInternal, {
    accountId: account!._id,
    email: 'verifyme@example.com',
  })

  await t.action(api.emailVerification.complete, { code: verificationCode.code })

  const user = await t.run((ctx) => ctx.db.get(userId as Id<'users'>))
  const updatedAccount = await t.run((ctx) =>
    ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'password').eq('providerAccountId', 'verifyme@example.com'))
      .unique(),
  )

  expect(user?.emailVerificationTime).toEqual(expect.any(Number))
  expect(updatedAccount?.emailVerified).toBe('verifyme@example.com')
})

test('seedFirstAdmin creates a trusted admin account', async () => {
  const t = convexTest(schema, modules)
  const { userId } = await t.action(api.accounts.seedFirstAdmin, {
    email: 'admin@example.com',
    password: 'password123',
    name: 'Admin',
  })

  const user = await t.run((ctx) => ctx.db.get(userId as Id<'users'>))
  expect(user?.role).toBe('admin')
  expect(user?.emailVerificationTime).toEqual(expect.any(Number))
})

test('createStaffAccount creates staff as already trusted', async () => {
  const t = convexTest(schema, modules)
  const adminId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      emailVerificationTime: Date.now(),
    }),
  )

  const { userId } = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .action(api.accounts.createStaffAccount, {
      email: 'staff@example.com',
      password: 'password123',
      name: 'Assistente',
      role: 'staff',
    })

  const user = await t.run((ctx) => ctx.db.get(userId as Id<'users'>))
  expect(user?.role).toBe('staff')
  expect(user?.emailVerificationTime).toEqual(expect.any(Number))
})

test('accounts.updateName persists the new name for the caller', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'member@example.com',
      name: 'Vecchio Nome',
      role: 'member',
    }),
  )

  await t
    .withIdentity({ subject: `${userId}|test-session` })
    .mutation(api.accounts.updateName, { name: 'Nuovo Nome' })

  const updated = await t.run((ctx) => ctx.db.get(userId as Id<'users'>))
  expect(updated?.name).toBe('Nuovo Nome')
})

test('accounts.updateName trims whitespace', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'member2@example.com',
      name: 'Nome',
      role: 'member',
    }),
  )

  await t
    .withIdentity({ subject: `${userId}|test-session` })
    .mutation(api.accounts.updateName, { name: '  Mario Rossi  ' })

  const updated = await t.run((ctx) => ctx.db.get(userId as Id<'users'>))
  expect(updated?.name).toBe('Mario Rossi')
})

test('accounts.updateName rejects names shorter than 2 chars', async () => {
  const t = convexTest(schema, modules)
  const userId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'member3@example.com',
      name: 'Nome',
      role: 'member',
    }),
  )

  await expect(
    t
      .withIdentity({ subject: `${userId}|test-session` })
      .mutation(api.accounts.updateName, { name: 'A' }),
  ).rejects.toThrow('Il nome deve avere almeno 2 caratteri')
})

test('accounts.updateName rejects unauthenticated callers', async () => {
  const t = convexTest(schema, modules)

  await expect(
    t.mutation(api.accounts.updateName, { name: 'Chiunque' }),
  ).rejects.toThrow('Non autenticato')
})

test('accounts.updateName does not modify other users', async () => {
  const t = convexTest(schema, modules)
  const { userId1, userId2 } = await t.run(async (ctx) => ({
    userId1: await ctx.db.insert('users', {
      email: 'member1@example.com',
      name: 'Primo',
      role: 'member',
    }),
    userId2: await ctx.db.insert('users', {
      email: 'member2b@example.com',
      name: 'Secondo',
      role: 'member',
    }),
  }))

  // user1 updates their own name
  await t
    .withIdentity({ subject: `${userId1}|test-session` })
    .mutation(api.accounts.updateName, { name: 'Primo Aggiornato' })

  // user2's name must remain unchanged
  const user2 = await t.run((ctx) => ctx.db.get(userId2 as Id<'users'>))
  expect(user2?.name).toBe('Secondo')
})
