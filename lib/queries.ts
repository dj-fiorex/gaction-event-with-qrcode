import 'server-only'
import { db } from './db'
import type { Event, EventWithStats, Registration } from './types'

export function computeStats(event: Event): EventWithStats {
  const regs = db.registrations.filter((r) => r.eventId === event.id)
  const seatsTaken = regs.reduce((sum, r) => sum + 1 + r.children.length, 0)
  return {
    ...event,
    registrationsCount: regs.length,
    seatsTaken,
    seatsAvailable: Math.max(0, event.capacity - seatsTaken),
  }
}

export function getEvents(): EventWithStats[] {
  return db.events
    .map(computeStats)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
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
