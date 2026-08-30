import { Email } from '@convex-dev/auth/providers/Email'
import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import type { EmailConfig, GenericActionCtxWithAuthConfig } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { MemberVerificationProvider } from './memberEmailVerification'

const PASSWORD_RESET_PROVIDER = 'member-password-reset'
const PASSWORD_RESET_CODE_EXPIRY_MS = 1000 * 60 * 60 * 24

function randomCode(length: number) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const maxByte = Math.floor(256 / alphabet.length) * alphabet.length
  let code = ''

  while (code.length < length) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= maxByte) continue
      code += alphabet[byte % alphabet.length]
      if (code.length === length) break
    }
  }

  return code
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Usata SOLO dai test (`tests/convex/accounts.test.ts`), che hanno bisogno di un
 * codice di reset in chiaro: in produzione i codici li genera convex-auth dentro
 * `signIn({ flow: 'reset' })` e ne salva solo lo sha256, quindi non sono
 * recuperabili. L'hash qui e' lo stesso formato usato da convex-auth
 * (sha256 esadecimale minuscolo), percio' il codice prodotto e' verificabile
 * dal flow reale. Nota: la scadenza reale e' `maxAge` del provider Email
 * (1 ora), non `PASSWORD_RESET_CODE_EXPIRY_MS`.
 */
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

/**
 * `sendVerificationRequest` va passato *dentro* `Email()`, non sovrascritto sul
 * literal esterno. Al sign-in convex-auth materializza il provider con
 * `merge(provider, provider.options)` e `options` e' esattamente l'oggetto
 * passato a `Email()`: un override esterno viene rimpiazzato silenziosamente e
 * l'email non parte mai (il codice di verifica viene comunque creato).
 * `id` e `authorize` restano invece sul literal esterno: `options` non li
 * contiene, e `merge` ignora i valori `undefined`.
 */
export const MemberPasswordResetProvider = {
  ...Email<DataModel>({
    // Il tipo del parametro di `Email()` dichiara la firma Auth.js a 1 argomento,
    // ma convex-auth invoca sempre `(params, ctx)` (vedi signIn.ts).
    sendVerificationRequest: (async (
      { identifier, url, expires }: { identifier: string; url: string; expires: Date },
      ctx: GenericActionCtxWithAuthConfig<DataModel>,
    ) => {
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
        throw new ConvexError("Invio dell'email di reset non riuscito")
      }
    }) as unknown as EmailConfig['sendVerificationRequest'],
  }),
  id: PASSWORD_RESET_PROVIDER,
  authorize: undefined,
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
