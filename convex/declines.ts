import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { getCurrentUser, normalizeEmail, requireAdmin, requireEmailUnusedForEvent } from './model'

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
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error('Evento non trovato')
    if (!event.confirmParticipation) throw new Error(DECLINE_NOT_ENABLED_ERROR)

    // Come in register: per un Membro loggato vale l'email dell'account, non
    // quella digitata — altrimenti la stessa persona può rispondere due volte
    // con email diverse e i controlli incrociati non si incontrano mai.
    const caller = await getCurrentUser(ctx)
    const email = normalizeEmail(
      caller?.role === 'member' && caller.email ? caller.email : args.email,
    )
    const name = args.name.trim()

    await requireEmailUnusedForEvent(ctx, args.eventId, email)

    const id = await ctx.db.insert('declines', {
      eventId: args.eventId,
      name,
      email,
      respondedAt: new Date().toISOString(),
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
    if (!decline) throw new Error('Rinuncia non trovata')
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
        name: d.name,
        email: d.email,
        respondedAt: d.respondedAt,
      }))
      .sort((a, b) => new Date(b.respondedAt).getTime() - new Date(a.respondedAt).getTime())
  },
})
