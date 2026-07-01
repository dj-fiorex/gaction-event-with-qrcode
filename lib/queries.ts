import 'server-only'
import { db } from './db'
import type {
  Activity,
  ActivityWithPeople,
  Event,
  EventWithStats,
  Person,
  Registration,
  Slot,
  SlotPerson,
  SlotWithAvailability,
  SlotWithPeople,
} from './types'

/** Conta quante Persone occupano un dato Slot in tutte le Prenotazioni. */
export function slotTaken(eventId: string, slotId: string): number {
  return db.registrations
    .filter((r) => r.eventId === eventId)
    .filter((r) => r.selections.some((s) => s.slotId === slotId))
    .reduce((sum, r) => sum + r.persons.length, 0)
}

function withSlotAvailability(eventId: string, slot: Slot): SlotWithAvailability {
  const taken = slotTaken(eventId, slot.id)
  return { ...slot, taken, available: Math.max(0, slot.capacity - taken) }
}

export function computeStats(event: Event): EventWithStats {
  const regs = db.registrations.filter((r) => r.eventId === event.id)
  const personsCount = regs.reduce((sum, r) => sum + r.persons.length, 0)

  const starts = event.activities.map((a) => new Date(a.start).getTime())
  const ends = event.activities.map((a) => new Date(a.end).getTime())

  const activities = event.activities.map((activity) => ({
    ...activity,
    slots: activity.slots.map((slot) => withSlotAvailability(event.id, slot)),
  }))

  const allSlots = activities.flatMap((a) => a.slots)
  const totalCapacity = allSlots.reduce((sum, s) => sum + s.capacity, 0)
  const totalTaken = allSlots.reduce((sum, s) => sum + s.taken, 0)
  const totalAvailable = allSlots.reduce((sum, s) => sum + s.available, 0)

  return {
    ...event,
    activities,
    registrationsCount: regs.length,
    personsCount,
    startsAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
    endsAt: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
    totalCapacity,
    totalTaken,
    totalAvailable,
    soldOut: allSlots.length > 0 && totalAvailable <= 0,
  }
}

export function getEvents(): EventWithStats[] {
  return db.events
    .map(computeStats)
    .sort((a, b) => {
      const at = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      const bt = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      return at - bt
    })
}

export function getEvent(id: string): EventWithStats | null {
  const event = db.events.find((e) => e.id === id)
  return event ? computeStats(event) : null
}

/**
 * Restituisce le Attività di un Evento con, per ogni Slot, l'elenco delle Persone
 * che lo occupano e lo stato del loro check-in su quello Slot.
 */
export function getActivityAttendance(eventId: string): ActivityWithPeople[] {
  const event = db.events.find((e) => e.id === eventId)
  if (!event) return []

  const regs = db.registrations.filter((r) => r.eventId === eventId)

  return event.activities.map((activity) => {
    const slots: SlotWithPeople[] = activity.slots.map((slot) => {
      const persons: SlotPerson[] = []

      for (const reg of regs) {
        const selected = reg.selections.some((s) => s.slotId === slot.id)
        if (!selected) continue

        for (const person of reg.persons) {
          const checkIn = person.activityCheckIns.find(
            (c) => c.activityId === activity.id && c.slotId === slot.id,
          )
          persons.push({
            id: person.id,
            name: person.name,
            category: person.category,
            ticketCode: person.ticketCode,
            checkedIn: Boolean(checkIn),
            checkedInAt: checkIn?.at ?? null,
            checkInCount: checkIn?.count ?? 0,
          })
        }
      }

      persons.sort((a, b) => a.name.localeCompare(b.name, 'it'))

      const taken = persons.length
      const checkedInCount = persons.filter((p) => p.checkedIn).length

      return {
        ...slot,
        taken,
        available: Math.max(0, slot.capacity - taken),
        persons,
        checkedInCount,
      }
    })

    return { ...activity, slots }
  })
}

export function getRegistrations(eventId?: string): Registration[] {
  const regs = eventId
    ? db.registrations.filter((r) => r.eventId === eventId)
    : db.registrations
  return [...regs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export interface PersonLookup {
  person: Person
  registration: Registration
  event: Event
}

/** Trova la Persona (e il suo contesto) a partire dal codice del QR. */
export function findPersonByTicket(ticketCode: string): PersonLookup | null {
  const code = ticketCode.trim()
  for (const registration of db.registrations) {
    const person = registration.persons.find((p) => p.ticketCode === code)
    if (person) {
      const event = db.events.find((e) => e.id === registration.eventId)
      if (event) return { person, registration, event }
    }
  }
  return null
}

export function findActivity(event: Event, activityId: string): Activity | undefined {
  return event.activities.find((a) => a.id === activityId)
}

export function findSlot(activity: Activity, slotId: string): Slot | undefined {
  return activity.slots.find((s) => s.id === slotId)
}
