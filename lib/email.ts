import { Resend } from 'resend'
import type { Event, Registration } from './types'

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'Eventi <onboarding@resend.dev>'

interface SendTicketArgs {
  registration: Registration
  event: Event
  qrDataUrl: string
}

function buildHtml({ registration, event }: SendTicketArgs): string {
  const dateLabel = new Date(event.date).toLocaleString('it-IT', {
    dateStyle: 'full',
    timeStyle: 'short',
  })
  const childrenBlock =
    registration.children.length > 0
      ? `<p style="margin:4px 0;color:#475569;"><strong>Bambini associati:</strong> ${registration.children
          .map((c) => `${c.name} (${c.age} anni)`)
          .join(', ')}</p>`
      : ''

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#1f3a8a;color:#ffffff;padding:20px 24px;">
      <h1 style="margin:0;font-size:20px;">Il tuo ticket è pronto</h1>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a;">${event.title}</h2>
      <p style="margin:4px 0;color:#475569;"><strong>Quando:</strong> ${dateLabel}</p>
      <p style="margin:4px 0;color:#475569;"><strong>Dove:</strong> ${event.location}</p>
      <p style="margin:4px 0;color:#475569;"><strong>Partecipante:</strong> ${registration.employeeName}</p>
      ${childrenBlock}
      <div style="text-align:center;margin:24px 0;">
        <img src="cid:ticket-qr" alt="QR code del ticket" width="240" height="240" style="border:1px solid #e2e8f0;border-radius:12px;" />
        <p style="margin:12px 0 0;font-family:monospace;font-size:16px;color:#0f172a;letter-spacing:1px;">${registration.ticketCode}</p>
      </div>
      <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">Presenta questo QR code all'ingresso. È valido per un solo accesso.</p>
    </div>
  </div>`
}

/**
 * Invia il ticket via email tramite Resend.
 * Se RESEND_API_KEY non è configurata, l'invio viene simulato (log) così da
 * non bloccare il flusso di registrazione in ambiente di sviluppo.
 */
export async function sendTicketEmail(args: SendTicketArgs): Promise<{ delivered: boolean; simulated: boolean }> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.log(
      `[v0] RESEND_API_KEY non configurata. Email simulata per ${args.registration.employeeEmail} (ticket ${args.registration.ticketCode}).`,
    )
    return { delivered: false, simulated: true }
  }

  try {
    const resend = new Resend(apiKey)
    const base64 = args.qrDataUrl.split(',')[1] ?? ''

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.registration.employeeEmail,
      subject: `Ticket per ${args.event.title}`,
      html: buildHtml(args),
      attachments: [
        {
          filename: 'ticket-qr.png',
          content: base64,
          contentId: 'ticket-qr',
        },
      ],
    })
    return { delivered: true, simulated: false }
  } catch (error) {
    console.log('[v0] Errore invio email Resend:', error)
    return { delivered: false, simulated: false }
  }
}
