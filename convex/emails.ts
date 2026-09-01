'use node'

import { v } from 'convex/values'
import { Resend } from 'resend'
import { render } from 'emailmd'
import type { GenericActionCtx } from 'convex/server'
import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import type { DataModel, Id } from './_generated/dataModel'
import { renderTicketsPdfBuffer } from '../lib/pdf/render-tickets'
import { closureFor, type SendAttempt } from '../lib/email-delivery'

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'Eventi <onboarding@resend.dev>'

/**
 * Invio dell'email di conferma con i biglietti (Resend).
 *
 * È **interna** e pianificata dalla mutation che apre la Consegna
 * (`registrations.register`, `registrations.resendTickets`), non
 * chiamata dal browser: l'invio è un lavoro del server (ADR 0015). Sparisce
 * così anche la superficie pubblica da cui chiunque conoscesse un
 * `registrationId` poteva innescare un reinvio.
 *
 * Non ritorna un esito a nessuno — non c'è più un chiamante che lo aspetti:
 * lo **scrive** sulla riga `emailDeliveries` aperta insieme alla Prenotazione,
 * e la schermata di Esito ci si iscrive sopra (ADR 0016).
 */
export const sendTickets = internalAction({
  args: {
    registrationId: v.id('registrations'),
    /** Riga «in corso» da chiudere appena il provider risponde. */
    deliveryId: v.id('emailDeliveries'),
    /**
     * Destinatario di *questo* tentativo, congelato nella transazione che ha
     * aperto la riga. Non si rilegge dalla Prenotazione: un Reinvio che
     * corregge `contactEmail` mentre questa action è in volo farebbe spedire a
     * un indirizzo diverso da quello che la riga dichiara, e la riga esiste
     * proprio per dire **a chi** era andata l'email (ADR 0016).
     */
    recipient: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Un solo punto di uscita: il tentativo si osserva, poi `closureFor` lo
    // traduce in esito e la riga si chiude una volta sola. Con una `close` per
    // ramo era facile aggiungerne uno e dimenticarsi di chiudere, cioè lasciare
    // «in corso» per sempre proprio il caso nuovo.
    const attempt = await attemptSend(ctx, args.registrationId, args.recipient)
    await ctx.runMutation(internal.emailDeliveries.close, {
      deliveryId: args.deliveryId,
      ...closureFor(attempt),
    })
    return null
  },
})

/**
 * Prova a spedire l'email di conferma e riferisce **come è andata**, senza
 * decidere che cosa significhi: la traduzione in esito è di `closureFor`, che è
 * pura e testabile, mentre qui vivono solo gli effetti.
 */
async function attemptSend(
  ctx: GenericActionCtx<DataModel>,
  registrationId: Id<'registrations'>,
  recipient: string,
): Promise<SendAttempt> {
  try {
    // Evento, copy e Persone si leggono qui: dal browser non arriva più nulla,
    // nemmeno il PDF. Il destinatario invece **non** si rilegge — arriva
    // congelato dalla transazione che ha aperto la riga.
    const document = await ctx.runQuery(internal.emailContent.ticketEmailDocument, {
      registrationId,
    })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log(
        `[email] RESEND_API_KEY non configurata. Email simulata per ${recipient} (${document.personsCount} biglietti).`,
      )
      return { kind: 'no-provider' }
    }

    // Il PDF si renderizza qui, dallo stesso documento del pulsante «Scarica
    // PDF», e non si salva da nessuna parte: si rigenera a ogni invio e si
    // butta, così porta sempre le etichette, le età e le allergie attuali.
    const pdfBuffer = await renderTicketsPdfBuffer(document.pdf.persons, {
      title: document.pdf.eventTitle,
      location: document.pdf.eventLocation,
      dateRange: document.pdf.eventDateRange,
      ticketHeader: document.pdf.ticketHeader,
      coverBytes: await fetchCoverBytes(document.pdf.coverUrl),
    })

    // Corpo dell'Evento e Riepilogo sono già concatenati come markdown: una
    // sola render(), nessuno splicing di HTML, così l'anteprima nel form
    // admin resta fedele a ciò che parte davvero.
    const { html, text } = await render(document.markdown)

    const resend = new Resend(apiKey)
    const res = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipient,
      subject: document.subject,
      html,
      text,
      attachments: [{ filename: document.pdf.filename, content: pdfBuffer.toString('base64') }],
    })

    // Il SDK Resend NON lancia sugli errori API: ritorna { data, error }. È
    // questo ramo a rendere osservabile la differenza fra «rifiutata» e «non
    // riuscita», che senza di lui collasserebbe come collassava prima.
    if (res.error) {
      console.error("[email] Resend ha rifiutato l'invio:", res.error)
      return { kind: 'provider-error', error: res.error }
    }
    return { kind: 'accepted' }
  } catch (error) {
    // Non siamo riusciti nemmeno a chiedere: rete, SDK, o il render del PDF.
    // L'email non parte monca — l'allegato non è best-effort (ADR 0015) — e il
    // rimedio è il Reinvio, che è dell'admin e a un clic dalla riga.
    console.error('[email] Invio non riuscito:', error)
    return { kind: 'threw', error }
  }
}

/**
 * Scarica la copertina dallo storage Convex come byte.
 *
 * Server-side non esiste il canvas su cui si appoggia il ramo browser: i byte
 * vanno presi così come sono, e a decidere se sono incorporabili è
 * `renderTicketsPdfBuffer`. Best-effort come di là: una copertina che non si
 * scarica vale un PDF senza copertina, non un invio mancato.
 */
async function fetchCoverBytes(url: string | null): Promise<ArrayBuffer | null> {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await response.arrayBuffer()
  } catch {
    return null
  }
}

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

      const res = await resend.emails.send({
        from: FROM_ADDRESS,
        to: args.email,
        subject: 'Verifica la tua email',
        html,
      })
      // Il SDK Resend NON lancia sugli errori API: ritorna { data, error }.
      if (res.error) {
        console.error("[email] Resend ha rifiutato l'email di verifica:", res.error)
        return { delivered: false, simulated: false }
      }
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

      const res = await resend.emails.send({
        from: FROM_ADDRESS,
        to: args.email,
        subject: 'Reimposta la tua password',
        html,
      })
      // Il SDK Resend NON lancia sugli errori API: ritorna { data, error }.
      if (res.error) {
        console.error("[email] Resend ha rifiutato l'email di reset:", res.error)
        return { delivered: false, simulated: false }
      }
      return { delivered: true, simulated: false }
    } catch (error) {
      console.log('[v0] Errore invio email reset Resend:', error)
      return { delivered: false, simulated: false }
    }
  },
})
