import { getAuthUserId } from '@convex-dev/auth/server'
import type { GenericActionCtxWithAuthConfig } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import { internal } from './_generated/api'
import { action, internalMutation } from './_generated/server'
import {
  completeMemberEmailVerification,
  requestMemberEmailVerification,
} from './memberEmailVerification'

const VERIFICATION_PROVIDER = 'member-email-verification'
const VERIFICATION_CODE_EXPIRY_MS = 1000 * 60 * 60 * 24

function randomCode(length: number) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const issueCodeInternal = internalMutation({
  args: {
    accountId: v.id('authAccounts'),
    email: v.string(),
  },
  returns: v.object({
    code: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('authVerificationCodes')
      .withIndex('accountId', (q) => q.eq('accountId', args.accountId))
      .unique()
    if (existing) {
      await ctx.db.delete(existing._id)
    }

    const code = randomCode(32)
    const expiresAt = Date.now() + VERIFICATION_CODE_EXPIRY_MS
    await ctx.db.insert('authVerificationCodes', {
      accountId: args.accountId,
      provider: VERIFICATION_PROVIDER,
      code: await sha256Hex(code),
      expirationTime: expiresAt,
      emailVerified: args.email,
    })
    return { code, expiresAt }
  },
})

export const completeCodeInternal = internalMutation({
  args: { code: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const codeHash = await sha256Hex(args.code)
    const verificationCode = await ctx.db
      .query('authVerificationCodes')
      .withIndex('code', (q) => q.eq('code', codeHash))
      .unique()

    if (!verificationCode || verificationCode.provider !== VERIFICATION_PROVIDER) {
      return false
    }

    if (verificationCode.expirationTime < Date.now()) {
      return false
    }

    const account = await ctx.db.get(verificationCode.accountId)
    if (!account) return false

    await ctx.db.delete(verificationCode._id)
    await ctx.db.patch(account._id, {
      emailVerified: verificationCode.emailVerified ?? account.providerAccountId,
    })
    await ctx.db.patch(account.userId, { emailVerificationTime: Date.now() })
    return true
  },
})

export const resend = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Non autenticato')

    const state: {
      email: string | null
      role: 'admin' | 'staff' | 'member'
      emailVerified: boolean
    } | null = await ctx.runQuery(internal.accounts.getVerificationStateInternal, { userId })

    if (!state || !state.email) throw new ConvexError('Account senza email verificabile')
    if (state.role !== 'member') throw new ConvexError('La verifica email non è richiesta per questo account')
    if (state.emailVerified) return null

    await requestMemberEmailVerification(
      ctx as unknown as GenericActionCtxWithAuthConfig<DataModel>,
      { email: state.email },
    )
    return null
  },
})

export const complete = action({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await completeMemberEmailVerification(
      ctx as unknown as GenericActionCtxWithAuthConfig<DataModel>,
      { code: args.code.trim() },
    )
    return null
  },
})
