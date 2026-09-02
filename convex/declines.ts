import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { getCurrentUser, normalizeEmail, requireAdmin, requireEmailUnusedForEvent } from './model'
import { acceptedNotes, acceptedPrivacyNotice } from './registrations'

/**
 * Rinuncia (ADR 0004): risposta «no» a Conferma di partecipazione. Vive in
 * una tabella dedicata — non è una Prenotazione: nessuna Persona, nessun
 * posto, nessun QR. Al massimo una Rinuncia per (evento, email normalizzata).
 *
 * ADR 0005: un'email con una risposta già registrata (Prenotazione o
 * Rinuncia) non può rispondere di nuovo dal form pubblico; ogni modifica
 * passa dall'organizzatore.
 */

const DECLINE_NOT_ENABLED_ERROR = 'Questo evento non richiede la conferma di partecipazione'

export const decline = mutation({
  args: {
    eventId: v.id('events'),
    /** Nome e cognome, entrambi obbligatori (ADR 0017): chi rinuncia dichiara sempre il proprio. */
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    /** Consenso all'informativa (ADR 0012). Anche il «no» raccoglie nome ed email. */
    privacyAccepted: v.optional(v.boolean()),
    /**
     * Nota (ADR 0019): il *perché* del «no». Stesso interruttore d'Evento della
     * Prenotazione — `collectNotes` accende la textarea su tutti e due i rami.
     */
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError('Evento non trovato')
    if (!event.confirmParticipation) throw new ConvexError(DECLINE_NOT_ENABLED_ERROR)

    // Stesso rifiuto della Prenotazione (ADR 0012): non esiste una porta di
    // servizio dove nome ed email entrano senza consenso.
    const privacyNoticeAccepted = acceptedPrivacyNotice(event, args.privacyAccepted)

    // Nota (ADR 0019): stesse regole della Prenotazione, stessa funzione.
    const notes = acceptedNotes(event, args.notes)

    // Come in register: per un Membro loggato vale l'email dell'account, non
    // quella digitata — altrimenti la stessa persona può rispondere due volte
    // con email diverse e i controlli incrociati non si incontrano mai.
    const caller = await getCurrentUser(ctx)
    const email = normalizeEmail(
      caller?.role === 'member' && caller.email ? caller.email : args.email,
    )
    const firstName = args.firstName.trim()
    const lastName = args.lastName.trim()

    await requireEmailUnusedForEvent(ctx, args.eventId, email)

    const id = await ctx.db.insert('declines', {
      eventId: args.eventId,
      firstName,
      lastName,
      email,
      respondedAt: new Date().toISOString(),
      ...(privacyNoticeAccepted ? { privacyNoticeAccepted } : {}),
      ...(notes ? { notes } : {}),
    })
    return { id }
  },
})

/**
 * Rimozione della Rinuncia (solo admin, ADR 0005): il rimedio operativo
 * quando chi ha risposto «no» scrive all'organizzatore per cambiare idea —
 * rimossa la Rinuncia, l'email torna libera di prenotare.
 */
export const remove = mutation({
  args: { declineId: v.id('declines') },
  handler: async (ctx, { declineId }) => {
    await requireAdmin(ctx)
    const decline = await ctx.db.get(declineId)
    if (!decline) throw new ConvexError('Rinuncia non trovata')
    await ctx.db.delete(declineId)
    return { success: true }
  },
})

/** Elenco Rinunce (solo admin), per un Evento o per tutti se eventId è omesso. */
export const list = query({
  args: { eventId: v.optional(v.id('events')) },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const declines = eventId
      ? await ctx.db
          .query('declines')
          .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
          .collect()
      : await ctx.db.query('declines').collect()

    return declines
      .map((d) => ({
        id: d._id,
        eventId: d.eventId,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        respondedAt: d.respondedAt,
        // Nota (ADR 0019): `list` è già dietro requireAdmin, e la Nota non
        // esce da qui — nessuna superficie pubblica o da Assistente la legge.
        notes: d.notes ?? null,
      }))
      .sort((a, b) => new Date(b.respondedAt).getTime() - new Date(a.respondedAt).getTime())
  },
})
