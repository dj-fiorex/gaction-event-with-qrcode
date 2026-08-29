import { v } from 'convex/values'
import { internalQuery } from './_generated/server'
import { buildTicketsEmailMarkdown, ticketsEmailSubject } from '../lib/email-content'

/**
 * Testo dell'email di conferma (issue #42), letto e composto server-side.
 *
 * Vive fuori da `emails.ts` perché quel modulo è `'use node'` e può esportare
 * solo action: l'action di invio chiama questa query per leggere Evento, copy,
 * Persone e destinatario, invece di riceverli dal browser.
 *
 * Restituisce già il documento markdown completo — corpo dell'Evento (o
 * ripiego) più Riepilogo della Prenotazione — così l'unico compito che resta
 * alla action è `render()` e la consegna.
 */
export const ticketEmailDocument = internalQuery({
  args: {
    registrationId: v.id('registrations'),
    /**
     * Se l'email porterà il PDF dei biglietti. Il corpo di ripiego lo annuncia,
     * e l'allegato è best-effort: può mancare.
     */
    hasPdf: v.boolean(),
  },
  returns: v.object({
    contactEmail: v.string(),
    subject: v.string(),
    markdown: v.string(),
    personsCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const registration = await ctx.db.get(args.registrationId)
    if (!registration) throw new Error('Prenotazione non trovata')

    const event = await ctx.db.get(registration.eventId)
    if (!event) throw new Error('Evento non trovato')

    const persons = await ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registration._id))
      .collect()

    return {
      contactEmail: registration.contactEmail,
      subject: ticketsEmailSubject(event.emailSubject, event.title),
      markdown: buildTicketsEmailMarkdown({
        emailBody: event.emailBody,
        event: { title: event.title, location: event.location },
        persons: persons.map((person) => ({
          name: person.name,
          category: person.category,
          age: person.age,
          allergies: person.allergies ?? null,
          ticketCode: person.ticketCode,
        })),
        collectNames: event.collectNames ?? true,
        hasPdf: args.hasPdf,
      }),
      personsCount: persons.length,
    }
  },
})
