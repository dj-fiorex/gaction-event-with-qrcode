import { ConvexError, v } from 'convex/values'
import { internalQuery } from './_generated/server'
import { personCategory, ticketHeader } from './schema'
import { resolveEventDates } from './model'
import { buildTicketsEmailMarkdown, ticketsEmailSubject } from '../lib/email-content'
import { EVENT_TIME_ZONE, formatDateRange } from '../lib/format'
import { ticketsPdfFilename } from '../lib/pdf/filename'
import { TICKET_HEADER_DEFAULT } from '../lib/pdf/ticket-header'

/**
 * Tutto ciò che serve a spedire l'email di conferma (issue #42, ADR 0015),
 * letto e composto server-side.
 *
 * Vive fuori da `emails.ts` perché quel modulo è `'use node'` e può esportare
 * solo action: l'action di invio chiama questa query per leggere Evento, copy e
 * Persone, invece di riceverli dal browser.
 *
 * Restituisce già il documento markdown completo — corpo dell'Evento (o
 * ripiego), con i Segnaposto sostituiti, più Riepilogo della Prenotazione se
 * l'Evento lo vuole — e il payload del PDF allegato, così alla action restano
 * solo `renderToBuffer()`, `render()` e la consegna.
 */
export const ticketEmailDocument = internalQuery({
  args: { registrationId: v.id('registrations') },
  returns: v.object({
    // Nessun `contactEmail`, di proposito: il destinatario non si rilegge qui.
    // Arriva alla action congelato dalla transazione che ha aperto la Consegna,
    // altrimenti un Reinvio in volo lo cambierebbe sotto i piedi e la riga
    // direbbe il falso su a chi era andata l'email (ADR 0016).
    subject: v.string(),
    markdown: v.string(),
    personsCount: v.number(),
    /**
     * Persone e Evento come li chiede `renderTicketsPdfBuffer`. I QR non
     * viaggiano di qui: li rigenera il renderer dai `ticketCode`, che restano
     * gli originali — i biglietti già in mano all'Utente continuano a valere.
     */
    pdf: v.object({
      filename: v.string(),
      eventTitle: v.string(),
      eventLocation: v.string(),
      eventDateRange: v.string(),
      /** URL della copertina sullo storage. null = nessuna copertina. */
      coverUrl: v.union(v.string(), v.null()),
      /**
       * Intestazione del Biglietto. Viaggia fin qui perché l'allegato è la
       * superficie da cui i biglietti arrivano davvero: una scelta che valesse
       * solo per i PDF scaricati a mano non sarebbe la scelta dell'Evento.
       */
      ticketHeader,
      persons: v.array(
        v.object({
          firstName: v.string(),
          lastName: v.union(v.string(), v.null()),
          category: personCategory,
          age: v.union(v.number(), v.null()),
          allergies: v.union(v.string(), v.null()),
          ticketCode: v.string(),
        }),
      ),
    }),
  }),
  handler: async (ctx, args) => {
    const registration = await ctx.db.get(args.registrationId)
    if (!registration) throw new ConvexError('Prenotazione non trovata')

    const event = await ctx.db.get(registration.eventId)
    if (!event) throw new ConvexError('Evento non trovato')

    const persons = await ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registration._id))
      .collect()

    // Date come le risolve la pagina dell'Evento, dalla stessa funzione: un
    // biglietto che raccontasse una data diversa sarebbe peggio di un
    // biglietto senza data (ADR 0009).
    const activities = await ctx.db
      .query('activities')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()
    const dates = resolveEventDates(event, activities)

    const pdfPersons = persons.map((person) => ({
      firstName: person.firstName,
      lastName: person.lastName ?? null,
      category: person.category,
      age: person.age,
      allergies: person.allergies ?? null,
      ticketCode: person.ticketCode,
    }))

    // Il Riepilogo ha un campo in più del biglietto: `nameProvided`, che dice
    // se il nome è dichiarato o generato (ADR 0017). Sul PDF non serve — lì il
    // nome si stampa e basta — quindi non lo si porta dove nessuno lo legge.
    const summaryPersons = persons.map((person, index) => ({
      ...pdfPersons[index],
      nameProvided: person.nameProvided,
    }))

    return {
      subject: ticketsEmailSubject(event.emailSubject, event.title),
      markdown: buildTicketsEmailMarkdown({
        emailBody: event.emailBody,
        event: { title: event.title, location: event.location },
        persons: summaryPersons,
        // L'allegato non è più best-effort: o il PDF si renderizza e l'email
        // parte con lui, o la Consegna si chiude «non riuscita» (ADR 0015).
        // Il corpo di ripiego può quindi annunciarlo senza riserve.
        hasPdf: true,
        // Assente = si vede: gli Eventi nati prima dell'interruttore mandano
        // la stessa email di prima, senza backfill.
        showSummary: event.emailShowSummary ?? true,
      }),
      personsCount: persons.length,
      pdf: {
        filename: ticketsPdfFilename(event.title),
        eventTitle: event.title,
        eventLocation: event.location,
        // Il fuso è dichiarato: la query gira in un runtime su UTC, e senza
        // dirlo il biglietto spedito porterebbe un orario diverso da quello
        // scaricato dalla stessa pagina.
        eventDateRange: formatDateRange(dates.startsAt, dates.endsAt, {
          timeZone: EVENT_TIME_ZONE,
        }),
        coverUrl: event.imageStorageId ? await ctx.storage.getUrl(event.imageStorageId) : null,
        // Assente = titolo, come nel DTO: nessun backfill per gli Eventi
        // esistenti.
        ticketHeader: event.ticketHeader ?? TICKET_HEADER_DEFAULT,
        persons: pdfPersons,
      },
    }
  },
})
