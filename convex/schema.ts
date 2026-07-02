import { defineSchema, defineTable } from 'convex/server'
import { authTables } from '@convex-dev/auth/server'
import { v } from 'convex/values'

/**
 * Enum di dominio riusati da schema e validatori delle functions.
 * Allineati a CONTEXT.md e all'originale lib/types.ts.
 */
export const activityPolicy = v.union(
  v.literal('all'),
  v.literal('min'),
  v.literal('free'),
)

export const checkInAccess = v.union(v.literal('private'), v.literal('password'))

export const personCategory = v.union(
  v.literal('user'),
  v.literal('child'),
  v.literal('companion'),
)

export const userRole = v.union(v.literal('admin'), v.literal('staff'))

export default defineSchema({
  // Tabelle di Convex Auth (users, authSessions, authAccounts, ...).
  ...authTables,

  // Estende la tabella `users` con i campi applicativi.
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    /** Ruolo applicativo. Assente = staff finché un admin non lo promuove. */
    role: v.optional(userRole),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  events: defineTable({
    title: v.string(),
    description: v.string(),
    location: v.string(),
    imageUrl: v.string(),
    activityPolicy,
    minActivities: v.number(),
    allowOverlap: v.boolean(),
    checkInToleranceMinutes: v.number(),
    allowQrReuse: v.boolean(),
    allowChildren: v.boolean(),
    maxChildrenPerRegistration: v.number(),
    allowCompanions: v.boolean(),
    maxCompanionsPerRegistration: v.number(),
    checkInAccess,
    scanToken: v.string(),
    /** Hash SHA-256 della password di check-in (solo modalità password). */
    checkInPasswordHash: v.union(v.string(), v.null()),
    /** Token opaco restituito dopo l'unlock via password. Ruota col cambio password. */
    scanUnlockToken: v.union(v.string(), v.null()),
  }).index('by_scanToken', ['scanToken']),

  activities: defineTable({
    eventId: v.id('events'),
    title: v.string(),
    start: v.string(),
    end: v.string(),
    slotDurationMinutes: v.number(),
    capacityPerSlot: v.number(),
    /** Ordine di visualizzazione dentro l'Evento. */
    order: v.number(),
  }).index('by_event', ['eventId']),

  slots: defineTable({
    eventId: v.id('events'),
    activityId: v.id('activities'),
    start: v.string(),
    end: v.string(),
    capacity: v.number(),
    order: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_activity', ['activityId']),

  registrations: defineTable({
    eventId: v.id('events'),
    contactEmail: v.string(),
  }).index('by_event', ['eventId']),

  slotSelections: defineTable({
    registrationId: v.id('registrations'),
    eventId: v.id('events'),
    activityId: v.id('activities'),
    slotId: v.id('slots'),
  })
    .index('by_registration', ['registrationId'])
    .index('by_slot', ['slotId'])
    .index('by_event', ['eventId']),

  persons: defineTable({
    registrationId: v.id('registrations'),
    eventId: v.id('events'),
    name: v.string(),
    category: personCategory,
    age: v.union(v.number(), v.null()),
    ticketCode: v.string(),
    eventCheckInAt: v.union(v.string(), v.null()),
    eventCheckInCount: v.number(),
    eventCheckInLastAt: v.union(v.string(), v.null()),
  })
    .index('by_ticketCode', ['ticketCode'])
    .index('by_registration', ['registrationId'])
    .index('by_event', ['eventId']),

  activityCheckIns: defineTable({
    personId: v.id('persons'),
    eventId: v.id('events'),
    activityId: v.id('activities'),
    slotId: v.id('slots'),
    at: v.string(),
    count: v.number(),
    lastAt: v.string(),
  })
    .index('by_person', ['personId'])
    .index('by_person_activity', ['personId', 'activityId'])
    .index('by_slot', ['slotId']),

  // Associazione Assistente–Evento (modalità private).
  eventStaff: defineTable({
    eventId: v.id('events'),
    userId: v.id('users'),
  })
    .index('by_event', ['eventId'])
    .index('by_user', ['userId'])
    .index('by_event_user', ['eventId', 'userId']),
})
