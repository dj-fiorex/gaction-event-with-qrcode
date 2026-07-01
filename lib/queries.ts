import 'server-only'
import { db } from './db'
import type {
  Activity,
  Event,
  EventWithStats,
  Person,
  Registration,
  Slot,
  SlotWithAvailability,
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

  return {
    ...event,
    activities: event.activities.map((activity) => ({
      ...activity,
      slots: activity.slots.map((slot) => withSlotAvailability(event.id, slot)),
    })),
    registrationsCount: regs.length,
    personsCount,
    startsAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
    endsAt: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
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
