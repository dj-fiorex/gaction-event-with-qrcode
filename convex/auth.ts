import { Email } from '@convex-dev/auth/providers/Email'
import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import type { EmailConfig, GenericActionCtxWithAuthConfig } from '@convex-dev/auth/server'
import { v } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { MemberVerificationProvider } from './memberEmailVerification'

const PASSWORD_RESET_PROVIDER = 'member-password-reset'
const PASSWORD_RESET_CODE_EXPIRY_MS = 1000 * 60 * 60 * 24

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

export const issuePasswordResetCodeInternal = internalMutation({
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
      .collect()

    for (const code of existing) {
      if (code.provider === PASSWORD_RESET_PROVIDER) {
        await ctx.db.delete(code._id)
      }
    }

    const code = randomCode(32)
    const expiresAt = Date.now() + PASSWORD_RESET_CODE_EXPIRY_MS
    await ctx.db.insert('authVerificationCodes', {
      accountId: args.accountId,
      provider: PASSWORD_RESET_PROVIDER,
      code: await sha256Hex(code),
      expirationTime: expiresAt,
      emailVerified: args.email,
    })
    return { code, expiresAt }
  },
})

export const MemberPasswordResetProvider = {
  ...Email<DataModel>({ sendVerificationRequest: async () => {} }),
  id: PASSWORD_RESET_PROVIDER,
  authorize: undefined,
  async sendVerificationRequest(
    { identifier, url, expires }: { identifier: string; url: string; expires: Date },
    ctx: GenericActionCtxWithAuthConfig<DataModel>,
  ) {
    const result: { delivered: boolean; simulated: boolean } = await ctx.runAction(
      internal.emails.sendMemberPasswordResetEmail,
      {
        email: identifier,
        resetUrl: url,
        expiresAt: expires.toLocaleString('it-IT', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'Europe/Rome',
        }),
      },
    )
    if (!result.delivered && !result.simulated) {
      throw new Error("Invio dell'email di reset non riuscito")
    }
  },
} as unknown as EmailConfig<DataModel>

/**
 * Provider Password.
 * Il flow "signUp" è abilitato per la registrazione pubblica dei Membri.
 * Il ruolo viene forzato a 'member' indipendentemente da qualsiasi input
 * del client: nessun client può ottenere 'admin' o 'staff' tramite questo
 * path. Admin/Assistenti vengono creati solo tramite `createStaffAccount`.
 */
const ApplicationPassword = Password<DataModel>({
  profile(params) {
    const email = String(params.email ?? '').trim().toLowerCase()
    if (params.flow === 'signUp') {
      const name = String(params.name ?? '').trim() || undefined
      // Role is ALWAYS 'member' for public sign-up — never from client input.
      return { email, name, role: 'member' as const }
    }
    return { email }
  },
  reset: MemberPasswordResetProvider as unknown as EmailConfig,
})

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ApplicationPassword, MemberVerificationProvider],
})
