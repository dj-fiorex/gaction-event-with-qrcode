import { Email } from '@convex-dev/auth/providers/Email'
import {
  retrieveAccount,
  signInViaProvider,
  type EmailConfig,
  type GenericActionCtxWithAuthConfig,
} from '@convex-dev/auth/server'
import type { Id, DataModel } from './_generated/dataModel'
import { internal } from './_generated/api'

const EMAIL_VERIFICATION_REDIRECT = '/verifica-email'

export const MemberVerificationProvider = {
  ...Email<DataModel>({ sendVerificationRequest: async () => {} }),
  id: 'member-email-verification',
  authorize: undefined,
  async sendVerificationRequest(
    { identifier, url, expires }: { identifier: string; url: string; expires: Date },
    ctx: GenericActionCtxWithAuthConfig<DataModel>,
  ) {
    const result: { delivered: boolean; simulated: boolean } = await ctx.runAction(
      internal.emails.sendMemberVerificationEmail,
      {
        email: identifier,
        verificationUrl: url,
        expiresAt: expires.toLocaleString('it-IT', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'Europe/Rome',
        }),
      },
    )
    if (!result.delivered && !result.simulated) {
      throw new Error("Invio dell'email di verifica non riuscito")
    }
  },
} as unknown as EmailConfig<DataModel>

export async function requestMemberEmailVerification(
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  args: { email: string; accountId?: Id<'authAccounts'> },
) {
  const authConfig = (ctx as { auth?: { config?: unknown } }).auth?.config
  const accountId =
    args.accountId ??
    (
      await retrieveAccount(ctx, {
        provider: 'password',
        account: { id: args.email },
      })
    ).account._id

  if (authConfig) {
    await signInViaProvider(ctx, MemberVerificationProvider, {
      accountId,
      params: { redirectTo: EMAIL_VERIFICATION_REDIRECT },
    })
    return
  }

  const issued: { code: string; expiresAt: number } = await ctx.runMutation(
    internal.emailVerification.issueCodeInternal,
    {
      accountId,
      email: args.email,
    },
  )
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.CONVEX_SITE_URL ??
    'http://localhost:3000'
  const result: { delivered: boolean; simulated: boolean } = await ctx.runAction(
    internal.emails.sendMemberVerificationEmail,
    {
      email: args.email,
      verificationUrl: `${baseUrl}${EMAIL_VERIFICATION_REDIRECT}?code=${encodeURIComponent(issued.code)}`,
      expiresAt: new Date(issued.expiresAt).toLocaleString('it-IT', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Rome',
      }),
    },
  )
  if (!result.delivered && !result.simulated) {
    throw new Error("Invio dell'email di verifica non riuscito")
  }
}

export async function completeMemberEmailVerification(
  ctx: GenericActionCtxWithAuthConfig<DataModel>,
  args: { code: string },
) {
  const completed = await ctx.runMutation(internal.emailVerification.completeCodeInternal, {
    code: args.code,
  })
  if (!completed) {
    throw new Error('Link di verifica non valido o scaduto')
  }
}
