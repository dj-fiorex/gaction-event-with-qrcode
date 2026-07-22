import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireAdmin } from './model'

/**
 * Rinuncia (ADR 0004): risposta «no» a Conferma di partecipazione. Vive in
 * una tabella dedicata — non è una Prenotazione: nessuna Persona, nessun
 * posto, nessun QR. Al massimo una Rinuncia per (evento, email normalizzata).
 */

const DECLINE_NOT_ENABLED_ERROR = 'Questo evento non richiede la conferma di partecipazione'
const DECLINE_BLOCKED_ERROR =
  'Risulti già iscritto a questo evento: contatta l’organizzatore per modificare la tua prenotazione'

/** Trim + lowercase, solo per dedup dentro l'Evento (mai identity linking, ADR 0003). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

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

    const email = normalizeEmail(args.email)
    const name = args.name.trim()

    const registrations = await ctx.db
      .query('registrations')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect()
    const alreadyRegistered = registrations.some(
      (r) => normalizeEmail(r.contactEmail) === email,
    )
    if (alreadyRegistered) throw new Error(DECLINE_BLOCKED_ERROR)

    const existing = await ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', args.eventId).eq('email', email))
      .unique()

    const respondedAt = new Date().toISOString()
    if (existing) {
      await ctx.db.patch(existing._id, { name, respondedAt })
      return { id: existing._id }
    }

    const id = await ctx.db.insert('declines', {
      eventId: args.eventId,
      name,
      email,
      respondedAt,
    })
    return { id }
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
