'use node'

import { v } from 'convex/values'
import { Resend } from 'resend'
import { render } from 'emailmd'
import { action, internalAction } from './_generated/server'
import { internal } from './_generated/api'

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'Eventi <onboarding@resend.dev>'

/**
 * Invio best-effort dei ticket via email (Resend).
 *
 * Riceve solo la Prenotazione e il PDF: Evento, Testo dell'email di conferma,
 * Persone e destinatario sono letti server-side (issue #42), non accettati dal
 * browser. I QR code non stanno più nel corpo — viaggiano solo nel PDF
 * allegato, che porta già una pagina per Persona (ADR 0007).
 *
 * Se RESEND_API_KEY non è configurata, simula l'invio.
 */
export const sendTickets = action({
  args: {
    registrationId: v.id('registrations'),
    /**
     * PDF dei biglietti (una pagina per Persona), renderizzato dal client come
     * per il pulsante «Scarica PDF». Il base64 arriva spezzato in blocchi
     * perché Convex limita ogni singola stringa a 1 MiB. Assente = nessun
     * allegato (l'email resta valida: il Riepilogo porta i codici biglietto).
     */
    pdf: v.optional(
      v.object({
        filename: v.string(),
        base64Chunks: v.array(v.string()),
      }),
    ),
  },
  returns: v.object({ delivered: v.boolean(), simulated: v.boolean() }),
  handler: async (ctx, args) => {
    // Prima la lettura: una Prenotazione inesistente è un errore da mostrare
    // all'admin che sta reinviando, non un invio silenziosamente saltato.
    const document = await ctx.runQuery(internal.emailContent.ticketEmailDocument, {
      registrationId: args.registrationId,
      hasPdf: args.pdf !== undefined,
    })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log(
        `[v0] RESEND_API_KEY non configurata. Email simulata per ${document.contactEmail} (${document.personsCount} biglietti).`,
      )
      return { delivered: false, simulated: true }
    }

    try {
      // Corpo dell'Evento e Riepilogo sono già concatenati come markdown: una
      // sola render(), nessuno splicing di HTML, così l'anteprima nel form
      // admin resta fedele a ciò che parte davvero.
      const { html, text } = await render(document.markdown)

      const resend = new Resend(apiKey)
      const res = await resend.emails.send({
        from: FROM_ADDRESS,
        to: document.contactEmail,
        subject: document.subject,
        html,
        text,
        ...(args.pdf
          ? {
              attachments: [
                { filename: args.pdf.filename, content: args.pdf.base64Chunks.join('') },
              ],
            }
          : {}),
      })
      console.log('[email] Email inviata con Resend:', res)
      return { delivered: true, simulated: false }
    } catch (error) {
      console.log('[v0] Errore invio email Resend:', error)
      return { delivered: false, simulated: false }
    }
  },
})

export const sendMemberVerificationEmail = internalAction({
  args: {
    email: v.string(),
    verificationUrl: v.string(),
    expiresAt: v.string(),
  },
  returns: v.object({
    delivered: v.boolean(),
    simulated: v.boolean(),
  }),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log(`[v0] RESEND_API_KEY non configurata. Email verifica simulata per ${args.email}.`)
      return { delivered: false, simulated: true }
    }

    try {
      const resend = new Resend(apiKey)
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:#1f3a8a;color:#ffffff;padding:20px 24px;">
            <h1 style="margin:0;font-size:20px;">Verifica il tuo indirizzo email</h1>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px;color:#475569;">
              Conferma la tua email per completare l'attivazione dell'account Membro.
            </p>
            <p style="margin:0 0 20px;color:#475569;">
              Il link resta valido fino al <strong>${args.expiresAt}</strong>.
            </p>
            <p style="margin:0 0 20px;">
              <a href="${args.verificationUrl}" style="display:inline-block;background:#1f3a8a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">
                Verifica email
              </a>
            </p>
            <p style="margin:0;color:#64748b;font-size:13px;word-break:break-all;">
              Se il pulsante non funziona, copia e apri questo link:<br />
              <a href="${args.verificationUrl}" style="color:#1d4ed8;">${args.verificationUrl}</a>
            </p>
          </div>
        </div>`

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: args.email,
        subject: 'Verifica la tua email',
        html,
      })
      return { delivered: true, simulated: false }
    } catch (error) {
      console.log('[v0] Errore invio email verifica Resend:', error)
      return { delivered: false, simulated: false }
    }
  },
})

export const sendMemberPasswordResetEmail = internalAction({
  args: {
    email: v.string(),
    resetUrl: v.string(),
    expiresAt: v.string(),
  },
  returns: v.object({
    delivered: v.boolean(),
    simulated: v.boolean(),
  }),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log(`[v0] RESEND_API_KEY non configurata. Email reset simulata per ${args.email}.`)
      return { delivered: false, simulated: true }
    }

    try {
      const resend = new Resend(apiKey)
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:#1f3a8a;color:#ffffff;padding:20px 24px;">
            <h1 style="margin:0;font-size:20px;">Reimposta la tua password</h1>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px;color:#475569;">
              Abbiamo ricevuto una richiesta di reset per il tuo account.
            </p>
            <p style="margin:0 0 20px;color:#475569;">
              Il link resta valido fino al <strong>${args.expiresAt}</strong>.
            </p>
            <p style="margin:0 0 20px;">
              <a href="${args.resetUrl}" style="display:inline-block;background:#1f3a8a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">
                Reimposta password
              </a>
            </p>
            <p style="margin:0;color:#64748b;font-size:13px;word-break:break-all;">
              Se il pulsante non funziona, copia e apri questo link:<br />
              <a href="${args.resetUrl}" style="color:#1d4ed8;">${args.resetUrl}</a>
            </p>
          </div>
        </div>`

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: args.email,
        subject: 'Reimposta la tua password',
        html,
      })
      return { delivered: true, simulated: false }
    } catch (error) {
      console.log('[v0] Errore invio email reset Resend:', error)
      return { delivered: false, simulated: false }
    }
  },
})
