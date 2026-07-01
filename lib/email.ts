import { Resend } from 'resend'
import { renderTicketsPdf, toTicketPdfEvent } from './pdf/render-tickets'
import type { Event, PersonCategory, Registration } from './types'

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'Eventi <onboarding@resend.dev>'

interface EmailPerson {
  name: string
  category: PersonCategory
  age: number | null
  ticketCode: string
  qrDataUrl: string
}

interface SendTicketsArgs {
  event: Event
  registration: Registration
  persons: EmailPerson[]
}

const CATEGORY_LABEL: Record<PersonCategory, string> = {
  user: 'Iscritto',
  child: 'Figlio',
  companion: 'Accompagnatore',
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'evento'
  )
}

function personBlock(person: EmailPerson, index: number): string {
  const ageLabel = person.category === 'child' && person.age != null ? ` · ${person.age} anni` : ''
  return `
    <div style="text-align:center;margin:20px 0;padding:16px;border:1px solid #e2e8f0;border-radius:12px;">
      <p style="margin:0 0 8px;font-size:14px;color:#475569;">
        <strong>${person.name}</strong> — ${CATEGORY_LABEL[person.category]}${ageLabel}
      </p>
      <img src="cid:qr-${index}" alt="QR code di ${person.name}" width="200" height="200" style="border:1px solid #e2e8f0;border-radius:12px;" />
      <p style="margin:12px 0 0;font-family:monospace;font-size:15px;color:#0f172a;letter-spacing:1px;">${person.ticketCode}</p>
    </div>`
}

function buildHtml({ event, persons }: SendTicketsArgs): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#1f3a8a;color:#ffffff;padding:20px 24px;">
      <h1 style="margin:0;font-size:20px;">I vostri QR sono pronti</h1>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a;">${event.title}</h2>
      <p style="margin:4px 0;color:#475569;"><strong>Dove:</strong> ${event.location}</p>
      <p style="margin:12px 0;color:#475569;">Ogni persona ha un proprio QR code. Presentatelo all'ingresso e a ogni attività prenotata.</p>
      <p style="margin:12px 0;color:#475569;">In allegato trovate anche il <strong>PDF con tutti i biglietti</strong> (una pagina per persona), pronto da stampare.</p>
      ${persons.map(personBlock).join('')}
    </div>
  </div>`
}

/**
 * Invia i ticket (un QR per Persona) all'email di contatto tramite Resend.
 * Se RESEND_API_KEY non è configurata, l'invio viene simulato (log) così da
 * non bloccare il flusso di registrazione in ambiente di sviluppo.
 */
export async function sendTicketsEmail(
  args: SendTicketsArgs,
): Promise<{ delivered: boolean; simulated: boolean }> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.log(
      `[v0] RESEND_API_KEY non configurata. Email simulata per ${args.registration.contactEmail} (${args.persons.length} QR).`,
    )
    return { delivered: false, simulated: true }
  }

  try {
    const resend = new Resend(apiKey)
    const ticketsPdf = await renderTicketsPdf(args.persons, toTicketPdfEvent(args.event))
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.registration.contactEmail,
      subject: `Ticket per ${args.event.title}`,
      html: buildHtml(args),
      attachments: [
        {
          filename: `${slugify(args.event.title)}-biglietti.pdf`,
          content: ticketsPdf,
        },
        ...args.persons.map((p, index) => ({
          filename: `qr-${index + 1}.png`,
          content: p.qrDataUrl.split(',')[1] ?? '',
          contentId: `qr-${index}`,
        })),
      ],
    })
    return { delivered: true, simulated: false }
  } catch (error) {
    console.log('[v0] Errore invio email Resend:', error)
    return { delivered: false, simulated: false }
  }
}
