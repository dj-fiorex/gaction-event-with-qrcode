import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireAdmin } from './model'

/** Assistenti associati a un Evento (solo admin). */
export const listForEvent = query({
  args: { eventId: v.id('events') },
  returns: v.array(v.id('users')),
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const rows = await ctx.db
      .query('eventStaff')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()
    return rows.map((r) => r.userId)
  },
})

/**
 * Sostituisce l'insieme di Assistenti associati a un Evento (solo admin).
 * Diff-based: rimuove le associazioni non più presenti e aggiunge le nuove.
 */
export const setForEvent = mutation({
  args: { eventId: v.id('events'), userIds: v.array(v.id('users')) },
  returns: v.null(),
  handler: async (ctx, { eventId, userIds }) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(eventId)
    if (!event) throw new Error('Evento non trovato')

    const existing = await ctx.db
      .query('eventStaff')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()

    const desired = new Set(userIds)
    const current = new Set(existing.map((e) => e.userId))

    for (const row of existing) {
      if (!desired.has(row.userId)) await ctx.db.delete(row._id)
    }
    for (const userId of userIds) {
      if (!current.has(userId)) {
        const user = await ctx.db.get(userId)
        if (!user) continue
        if (user.role === 'member') {
          throw new Error('Puoi associare all\'evento solo account admin o staff')
        }
        await ctx.db.insert('eventStaff', { eventId, userId })
      }
    }
    return null
  },
})
