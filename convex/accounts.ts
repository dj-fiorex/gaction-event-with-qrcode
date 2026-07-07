import { action, mutation, query, internalQuery, internalMutation } from './_generated/server'
import { v } from 'convex/values'
import { getAuthUserId, createAccount } from '@convex-dev/auth/server'
import { internal } from './_generated/api'
import { requireAdmin } from './model'

const accountValidator = v.object({
  id: v.id('users'),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: v.union(v.literal('admin'), v.literal('staff'), v.literal('member')),
})

/** Validator for staff/admin accounts only (members excluded). */
const staffAccountValidator = v.object({
  id: v.id('users'),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: v.union(v.literal('admin'), v.literal('staff')),
})

/** Elenco account operatori (solo admin). I Membri sono esclusi. */
export const list = query({
  args: {},
  returns: v.array(staffAccountValidator),
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const users = await ctx.db.query('users').collect()
    return users
      .filter((u) => (u.role ?? 'staff') !== 'member')
      .map((u) => ({
        id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        role: (u.role ?? 'staff') as 'admin' | 'staff',
      }))
  },
})

/** Utente corrente + ruolo, per la UI (null se anonimo). */
export const me = query({
  args: {},
  returns: v.union(
    v.object({
      id: v.id('users'),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      role: v.union(v.literal('admin'), v.literal('staff'), v.literal('member')),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const u = await ctx.db.get(userId)
    if (!u) return null
    return {
      id: u._id,
      name: u.name ?? null,
      email: u.email ?? null,
      role: u.role ?? ('staff' as const),
    }
  },
})

/* -- Helper interni usati dalle action (che non hanno accesso diretto al db) -- */

export const requireAdminInternal = internalQuery({
  args: { userId: v.union(v.id('users'), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!args.userId) return false
    const u = await ctx.db.get(args.userId)
    return u?.role === 'admin'
  },
})

export const emailExists = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', args.email))
      .unique()
    return existing !== null
  },
})

export const hasAnyUser = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const first = await ctx.db.query('users').first()
    return first !== null
  },
})

/** True quando non esiste ancora alcun account: la UI mostra il setup iniziale. */
export const needsBootstrap = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const first = await ctx.db.query('users').first()
    return first === null
  },
})

/**
 * Crea il primo account admin quando il sistema non ha ancora alcun utente.
 * Serve al bootstrap iniziale (nessuna registrazione pubblica). È pubblica ma
 * inerte non appena esiste almeno un utente.
 */
export const seedFirstAdmin = action({
  args: { email: v.string(), password: v.string(), name: v.string() },
  returns: v.object({ userId: v.id('users') }),
  handler: async (ctx, args): Promise<{ userId: import('./_generated/dataModel').Id<'users'> }> => {
    if (await ctx.runQuery(internal.accounts.hasAnyUser, {})) {
      throw new Error('Esiste già almeno un account: registrazione bootstrap disabilitata')
    }
    const email = args.email.trim().toLowerCase()
    if (!email) throw new Error('Email obbligatoria')
    if (args.password.length < 8) throw new Error('La password deve avere almeno 8 caratteri')

    const result = await createAccount(ctx, {
      provider: 'password',
      account: { id: email, secret: args.password },
      profile: { email, name: args.name.trim(), role: 'admin' },
    })
    return { userId: result.user._id }
  },
})

/**
 * Crea un account operatore/admin (solo admin).
 * `createAccount` richiede un contesto action, quindi questa è una action.
 */
export const createStaffAccount = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    role: v.union(v.literal('admin'), v.literal('staff')),
  },
  returns: v.object({ userId: v.id('users') }),
  handler: async (ctx, args): Promise<{ userId: import('./_generated/dataModel').Id<'users'> }> => {
    const callerId = await getAuthUserId(ctx)
    const isAdmin = await ctx.runQuery(internal.accounts.requireAdminInternal, {
      userId: callerId,
    })
    if (!isAdmin) throw new Error('Accesso riservato agli amministratori')

    const email = args.email.trim().toLowerCase()
    if (!email) throw new Error('Email obbligatoria')
    if (args.password.length < 8) throw new Error('La password deve avere almeno 8 caratteri')
    if (await ctx.runQuery(internal.accounts.emailExists, { email })) {
      throw new Error('Esiste già un account con questa email')
    }

    const result = await createAccount(ctx, {
      provider: 'password',
      account: { id: email, secret: args.password },
      profile: { email, name: args.name.trim(), role: args.role },
    })
    return { userId: result.user._id }
  },
})

/** Cambia il ruolo di un account (solo admin, no auto-declassamento). */
export const setRole = mutation({
  args: { userId: v.id('users'), role: v.union(v.literal('admin'), v.literal('staff')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (admin._id === args.userId && args.role !== 'admin') {
      throw new Error('Non puoi rimuovere il tuo stesso ruolo admin')
    }
    await ctx.db.patch(args.userId, { role: args.role })
    return null
  },
})

/** Elimina un account e le sue associazioni evento (solo admin, non se stesso). */
export const remove = mutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (admin._id === args.userId) throw new Error('Non puoi eliminare il tuo account')

    const assocs = await ctx.db
      .query('eventStaff')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect()
    for (const a of assocs) await ctx.db.delete(a._id)

    const authAccounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', args.userId))
      .collect()
    for (const acc of authAccounts) await ctx.db.delete(acc._id)

    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', args.userId))
      .collect()
    for (const s of sessions) await ctx.db.delete(s._id)

    await ctx.db.delete(args.userId)
    return null
  },
})

/**
 * Promuove a admin il primo utente registrato quando non esiste ancora alcun admin.
 * Usato dal bootstrap iniziale (vedi seed). Idempotente.
 */
export const bootstrapFirstAdmin = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const anyAdmin = await ctx.db
      .query('users')
      .filter((q) => q.eq(q.field('role'), 'admin'))
      .first()
    if (!anyAdmin) {
      await ctx.db.patch(args.userId, { role: 'admin' })
    }
    return null
  },
})

/**
 * Registrazione pubblica di un Membro.
 * Il ruolo è sempre 'member': nessun input del client può produrre
 * un ruolo diverso. Admin/Assistenti vengono creati solo tramite
 * `createStaffAccount`.
 */
export const signUpMember = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  returns: v.object({ userId: v.id('users') }),
  handler: async (ctx, args): Promise<{ userId: import('./_generated/dataModel').Id<'users'> }> => {
    const email = args.email.trim().toLowerCase()
    if (!email) throw new Error('Email obbligatoria')
    if (args.name.trim().length < 2) throw new Error('Inserisci nome e cognome')
    if (args.password.length < 8) throw new Error('La password deve avere almeno 8 caratteri')
    if (await ctx.runQuery(internal.accounts.emailExists, { email })) {
      throw new Error('Esiste già un account con questa email')
    }

    const result = await createAccount(ctx, {
      provider: 'password',
      account: { id: email, secret: args.password },
      // Role is ALWAYS 'member' — cannot be overridden by client input.
      profile: { email, name: args.name.trim(), role: 'member' },
    })
    return { userId: result.user._id }
  },
})
