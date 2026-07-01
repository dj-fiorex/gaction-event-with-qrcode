import { getAuthUserId } from '@convex-dev/auth/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

/* ------------------------------------------------------------------ */
/* Hashing password di check-in (Web Crypto, runtime Convex)           */
/* ------------------------------------------------------------------ */

const CHECKIN_SALT = 'evt-checkin:v1'

export async function hashCheckInPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${CHECKIN_SALT}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyCheckInPassword(
  password: string,
  hash: string | null,
): Promise<boolean> {
  if (!hash) return false
  return (await hashCheckInPassword(password)) === hash
}

/** Token opaco per link di scansione e unlock via password. */
export function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Codice ticket univoco e leggibile (1 per Persona), funge da contenuto QR. */
export function generateTicketCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  return `TCK-${time}-${random}`
}

/* ------------------------------------------------------------------ */
/* Autenticazione / autorizzazione                                     */
/* ------------------------------------------------------------------ */

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'> | null> {
  const userId = await getAuthUserId(ctx)
  if (!userId) return null
  return ctx.db.get(userId)
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'>> {
  const user = await getCurrentUser(ctx)
  if (!user) throw new Error('Non autenticato')
  return user
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'>> {
  const user = await requireUser(ctx)
  if (user.role !== 'admin') throw new Error('Accesso riservato agli amministratori')
  return user
}

/**
 * Autorizza l'operazione di check-in su un Evento.
 * - admin: sempre.
 * - staff: eventi password sempre; eventi private solo se associato.
 * - anonimo: solo eventi password con unlockToken valido.
 */
export async function canOperateEvent(
  ctx: QueryCtx | MutationCtx,
  event: Doc<'events'>,
  unlockToken?: string | null,
): Promise<boolean> {
  const user = await getCurrentUser(ctx)
  if (user) {
    if (user.role === 'admin') return true
    if (event.checkInAccess === 'password') return true
    const assoc = await ctx.db
      .query('eventStaff')
      .withIndex('by_event_user', (q) => q.eq('eventId', event._id).eq('userId', user._id))
      .unique()
    return assoc !== null
  }
  if (event.checkInAccess === 'password' && unlockToken) {
    return event.scanUnlockToken !== null && unlockToken === event.scanUnlockToken
  }
  return false
}

/* ------------------------------------------------------------------ */
/* Composizione statistiche Evento (shape compatibile col frontend)    */
/* ------------------------------------------------------------------ */

export interface SlotWithAvailabilityDTO {
  id: string
  activityId: string
  start: string
  end: string
  capacity: number
  taken: number
  available: number
}

export interface ActivityWithAvailabilityDTO {
  id: string
  eventId: string
  title: string
  start: string
  end: string
  slotDurationMinutes: number
  capacityPerSlot: number
  slots: SlotWithAvailabilityDTO[]
}

export interface EventWithStatsDTO {
  id: string
  title: string
  description: string
  location: string
  imageUrl: string
  createdAt: string
  activityPolicy: 'all' | 'min' | 'free'
  minActivities: number
  allowOverlap: boolean
  checkInToleranceMinutes: number
  allowQrReuse: boolean
  allowChildren: boolean
  maxChildrenPerRegistration: number
  allowCompanions: boolean
  maxCompanionsPerRegistration: number
  checkInAccess: 'private' | 'password'
  scanToken: string
  hasCheckInPassword: boolean
  registrationsCount: number
  personsCount: number
  startsAt: string | null
  endsAt: string | null
  totalCapacity: number
  totalTaken: number
  totalAvailable: number
  soldOut: boolean
}

/** Conta le Persone che occupano un dato Slot in tutte le Prenotazioni. */
async function slotTaken(
  ctx: QueryCtx | MutationCtx,
  slotId: Id<'slots'>,
): Promise<number> {
  const selections = await ctx.db
    .query('slotSelections')
    .withIndex('by_slot', (q) => q.eq('slotId', slotId))
    .collect()
  let total = 0
  for (const sel of selections) {
    const persons = await ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', sel.registrationId))
      .collect()
    total += persons.length
  }
  return total
}

export async function loadEventWithStats(
  ctx: QueryCtx | MutationCtx,
  event: Doc<'events'>,
  opts: { includeScanToken: boolean },
): Promise<EventWithStatsDTO> {
  const activities = await ctx.db
    .query('activities')
    .withIndex('by_event', (q) => q.eq('eventId', event._id))
    .collect()
  activities.sort((a, b) => a.order - b.order)

  const activityDTOs: ActivityWithAvailabilityDTO[] = []
  for (const activity of activities) {
    const slots = await ctx.db
      .query('slots')
      .withIndex('by_activity', (q) => q.eq('activityId', activity._id))
      .collect()
    slots.sort((a, b) => a.order - b.order)

    const slotDTOs: SlotWithAvailabilityDTO[] = []
    for (const slot of slots) {
      const taken = await slotTaken(ctx, slot._id)
      slotDTOs.push({
        id: slot._id,
        activityId: activity._id,
        start: slot.start,
        end: slot.end,
        capacity: slot.capacity,
        taken,
        available: Math.max(0, slot.capacity - taken),
      })
    }

    activityDTOs.push({
      id: activity._id,
      eventId: event._id,
      title: activity.title,
      start: activity.start,
      end: activity.end,
      slotDurationMinutes: activity.slotDurationMinutes,
      capacityPerSlot: activity.capacityPerSlot,
      slots: slotDTOs,
    })
  }

  const registrations = await ctx.db
    .query('registrations')
    .withIndex('by_event', (q) => q.eq('eventId', event._id))
    .collect()
  const persons = await ctx.db
    .query('persons')
    .withIndex('by_event', (q) => q.eq('eventId', event._id))
    .collect()

  const starts = activities.map((a) => new Date(a.start).getTime())
  const ends = activities.map((a) => new Date(a.end).getTime())
  const allSlots = activityDTOs.flatMap((a) => a.slots)
  const totalCapacity = allSlots.reduce((sum, s) => sum + s.capacity, 0)
  const totalTaken = allSlots.reduce((sum, s) => sum + s.taken, 0)
  const totalAvailable = allSlots.reduce((sum, s) => sum + s.available, 0)

  return {
    id: event._id,
    title: event.title,
    description: event.description,
    location: event.location,
    imageUrl: event.imageUrl,
    createdAt: new Date(event._creationTime).toISOString(),
    activityPolicy: event.activityPolicy,
    minActivities: event.minActivities,
    allowOverlap: event.allowOverlap,
    checkInToleranceMinutes: event.checkInToleranceMinutes,
    allowQrReuse: event.allowQrReuse,
    allowChildren: event.allowChildren,
    maxChildrenPerRegistration: event.maxChildrenPerRegistration,
    allowCompanions: event.allowCompanions,
    maxCompanionsPerRegistration: event.maxCompanionsPerRegistration,
    checkInAccess: event.checkInAccess,
    scanToken: opts.includeScanToken ? event.scanToken : '',
    hasCheckInPassword: event.checkInPasswordHash !== null,
    registrationsCount: registrations.length,
    personsCount: persons.length,
    startsAt: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
    endsAt: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
    totalCapacity,
    totalTaken,
    totalAvailable,
    soldOut: allSlots.length > 0 && totalAvailable <= 0,
  }
}
