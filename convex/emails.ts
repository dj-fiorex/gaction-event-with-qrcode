'use node'

import { v } from 'convex/values'
import { Resend } from 'resend'
import { action, internalAction } from './_generated/server'
import { personCategory } from './schema'
import { CATEGORY_LABEL } from '../lib/person-labels'

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'Eventi <onboarding@resend.dev>'

const emailPerson = v.object({
  name: v.string(),
  category: personCategory,
  age: v.union(v.number(), v.null()),
  ticketCode: v.string(),
  qrDataUrl: v.string(),
})

function personBlock(
  person: { name: string; category: 'user' | 'child' | 'companion'; age: number | null; ticketCode: string },
  index: number,
  collectNames: boolean,
): string {
  const ageLabel = person.category === 'child' && person.age != null ? ` · ${person.age} anni` : ''
  // Con «Raccolta nomi» disattiva (issue #36) il nome di Figli/Ospiti È già
  // l'Etichetta posizionale («Figlio 1», «Ospite 1»): si mostra da sola (con
  // l'età per i Figli), senza ripetere la categoria. L'Iscritto conserva sempre
  // il proprio nome, quindi la categoria «Iscritto» resta indicata.
  const isPositionalLabel = !collectNames && person.category !== 'user'
  const header = isPositionalLabel
    ? `<strong>${person.name}</strong>${ageLabel}`
    : `<strong>${person.name}</strong> — ${CATEGORY_LABEL[person.category]}${ageLabel}`
  return `
    <div style="text-align:center;margin:20px 0;padding:16px;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        ${header}
      </p>
      <img src="cid:qr-${index}" alt="QR code di ${person.name}" width="200" height="200" style="border:1px solid #e2e8f0;border-radius:12px;" />
      <p style="margin:12px 0 0;font-family:monospace;font-size:15px;color:#0f172a;letter-spacing:1px;">${person.ticketCode}</p>
    </div>`
}

/**
 * Invio best-effort dei ticket via email (Resend). Riceve i QR già renderizzati
 * dal client come data URL. Se RESEND_API_KEY non è configurata, simula l'invio.
 */
export const sendTickets = action({
  args: {
    eventTitle: v.string(),
    eventLocation: v.string(),
    contactEmail: v.string(),
    /** Raccolta nomi dell'Evento: false ⇒ i blocchi mostrano l'Etichetta posizionale. */
    collectNames: v.boolean(),
    persons: v.array(emailPerson),
  },
  returns: v.object({ delivered: v.boolean(), simulated: v.boolean() }),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log(
        `[v0] RESEND_API_KEY non configurata. Email simulata per ${args.contactEmail} (${args.persons.length} QR).`,
      )
      return { delivered: false, simulated: true }
    }

    try {
      const resend = new Resend(apiKey)
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:#1f3a8a;color:#ffffff;padding:20px 24px;">
            <h1 style="margin:0;font-size:20px;">I vostri QR sono pronti</h1>
          </div>
          <div style="padding:24px;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a;">${args.eventTitle}</h2>
            <p style="margin:4px 0;color:#475569;"><strong>Dove:</strong> ${args.eventLocation}</p>
            <p style="margin:12px 0;color:#475569;">Ogni persona ha un proprio QR code. Presentatelo all'ingresso e a ogni attività prenotata.</p>
            ${args.persons.map((p, index) => personBlock(p, index, args.collectNames)).join('')}
          </div>
        </div>`

      const res = await resend.emails.send({
        from: FROM_ADDRESS,
        to: args.contactEmail,
        subject: `Ticket per ${args.eventTitle}`,
        html,
        attachments: args.persons.map((p, index) => ({
          filename: `qr-${index + 1}.png`,
          content: p.qrDataUrl.split(',')[1] ?? '',
          contentId: `qr-${index}`,
        })),
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
              Abbiamo ricevuto una richiesta di reset per il tuo account Membro.
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
