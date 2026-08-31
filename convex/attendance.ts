import { v } from 'convex/values'
import { query } from './_generated/server'
import { requireAdmin } from './model'

/**
 * Attività di un Evento con, per ogni Slot, l'elenco delle Persone che lo
 * occupano e lo stato del loro check-in su quello Slot. Solo admin.
 */
export const getActivityAttendance = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(eventId)
    if (!event) return []

    const activities = await ctx.db
      .query('activities')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()
    activities.sort((a, b) => a.order - b.order)

    const result = []
    for (const activity of activities) {
      const slots = await ctx.db
        .query('slots')
        .withIndex('by_activity', (q) => q.eq('activityId', activity._id))
        .collect()
      slots.sort((a, b) => a.order - b.order)

      const slotDTOs = []
      for (const slot of slots) {
        const selections = await ctx.db
          .query('slotSelections')
          .withIndex('by_slot', (q) => q.eq('slotId', slot._id))
          .collect()

        const persons = []
        for (const sel of selections) {
          const regPersons = await ctx.db
            .query('persons')
            .withIndex('by_registration', (q) => q.eq('registrationId', sel.registrationId))
            .collect()
          for (const person of regPersons) {
            const checkIn = await ctx.db
              .query('activityCheckIns')
              .withIndex('by_person_activity', (q) =>
                q.eq('personId', person._id).eq('activityId', activity._id),
              )
              .unique()
            persons.push({
              id: person._id,
              name: person.name,
              category: person.category,
              allergies: person.allergies ?? null,
              ticketCode: person.ticketCode,
              checkedIn: checkIn !== null,
              checkedInAt: checkIn?.at ?? null,
              checkInCount: checkIn?.count ?? 0,
            })
          }
        }

        persons.sort((a, b) => a.name.localeCompare(b.name, 'it'))
        const taken = persons.length
        const checkedInCount = persons.filter((p) => p.checkedIn).length

        slotDTOs.push({
          id: slot._id,
          activityId: activity._id,
          start: slot.start,
          end: slot.end,
          capacity: slot.capacity,
          taken,
          available: slot.capacity === null ? null : Math.max(0, slot.capacity - taken),
          persons,
          checkedInCount,
        })
      }

      result.push({
        id: activity._id,
        eventId,
        title: activity.title,
        start: activity.start,
        end: activity.end,
        slotDurationMinutes: activity.slotDurationMinutes,
        capacityPerSlot: activity.capacityPerSlot,
        freeAccess: activity.freeAccess ?? false,
        slots: slotDTOs,
      })
    }

    return result
  },
})
