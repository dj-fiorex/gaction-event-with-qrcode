import { v } from 'convex/values'
import { internalQuery, mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { activityPolicy, checkInAccess } from './schema'
import {
  canOperateEvent,
  getCurrentUser,
  hashCheckInPassword,
  loadEventWithStats,
  randomToken,
  requireAdmin,
  requireCanOperate,
} from './model'
import { generateSlots } from '../lib/slots'
import { parseAllowedOrigins } from '../lib/embed'

const activityInput = v.object({
  title: v.string(),
  start: v.string(),
  end: v.string(),
  slotDurationMinutes: v.number(),
  capacityPerSlot: v.number(),
})

const eventInput = {
  title: v.string(),
  description: v.string(),
  location: v.string(),
  imageStorageId: v.optional(v.id('_storage')),
  activityPolicy,
  minActivities: v.number(),
  allowOverlap: v.boolean(),
  checkInToleranceMinutes: v.number(),
  allowQrReuse: v.boolean(),
  requireAccount: v.boolean(),
  confirmParticipation: v.boolean(),
  collectNames: v.boolean(),
  collectAllergies: v.boolean(),
  recordExit: v.boolean(),
  allowChildren: v.boolean(),
  maxChildrenPerRegistration: v.number(),
  allowCompanions: v.boolean(),
  maxCompanionsPerRegistration: v.number(),
  maxCompanionsWithChildren: v.optional(v.number()),
  checkInAccess,
  checkInPassword: v.optional(v.string()),
  activities: v.array(activityInput),
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** Elenco pubblico (senza scanToken) ordinato per inizio. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query('events').collect()
    const stats = await Promise.all(
      events.map((e) => loadEventWithStats(ctx, e, { includeScanToken: false })),
    )
    return stats.sort((a, b) => {
      const at = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      const bt = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      return at - bt
    })
  },
})

/** Dettaglio pubblico di un Evento (senza scanToken). */
export const getPublic = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId)
    if (!event) return null
    return loadEventWithStats(ctx, event, { includeScanToken: false })
  },
})

/** Elenco per admin (con scanToken). Solo admin. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const events = await ctx.db.query('events').collect()
    const stats = await Promise.all(
      events.map((e) => loadEventWithStats(ctx, e, { includeScanToken: true })),
    )
    return stats.sort((a, b) => {
      const at = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      const bt = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      return at - bt
    })
  },
})

/** Elenco degli Eventi operabili dall'utente corrente (admin o staff). */
export const listOperable = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    if (!user) return []
    const events = await ctx.db.query('events').collect()
    const operable = []
    for (const e of events) {
      if (await canOperateEvent(ctx, e)) {
        operable.push(await loadEventWithStats(ctx, e, { includeScanToken: true }))
      }
    }
    return operable.sort((a, b) => {
      const at = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      const bt = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER
      return at - bt
    })
  },
})

/** Dettaglio per admin (con scanToken). Solo admin. */
export const getForAdmin = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(eventId)
    if (!event) return null
    return loadEventWithStats(ctx, event, { includeScanToken: true })
  },
})

/** Risolve un Evento dal token del link di scansione. */
export const getByScanToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const trimmed = token.trim()
    if (!trimmed) return null
    const event = await ctx.db
      .query('events')
      .withIndex('by_scanToken', (q) => q.eq('scanToken', trimmed))
      .unique()
    if (!event) return null
    return loadEventWithStats(ctx, event, { includeScanToken: true })
  },
})

/* ------------------------------------------------------------------ */
/* Mutations (admin)                                                   */
/* ------------------------------------------------------------------ */

function normalizeMinActivities(policy: 'all' | 'min' | 'free', min: number, count: number) {
  if (policy !== 'min') return 0
  return min
}

async function insertActivitiesAndSlots(
  ctx: MutationCtx,
  eventId: Id<'events'>,
  activities: Array<{
    title: string
    start: string
    end: string
    slotDurationMinutes: number
    capacityPerSlot: number
  }>,
): Promise<void> {
  for (let index = 0; index < activities.length; index++) {
    const a = activities[index]
    const start = new Date(a.start).toISOString()
    const end = new Date(a.end).toISOString()
    const activityId = await ctx.db.insert('activities', {
      eventId,
      title: a.title,
      start,
      end,
      slotDurationMinutes: a.slotDurationMinutes,
      capacityPerSlot: a.capacityPerSlot,
      order: index,
    })
    const generated = generateSlots(activityId, start, end, a.slotDurationMinutes, a.capacityPerSlot)
    for (let s = 0; s < generated.length; s++) {
      const slot = generated[s]
      await ctx.db.insert('slots', {
        eventId,
        activityId,
        start: slot.start,
        end: slot.end,
        capacity: slot.capacity,
        order: s,
      })
    }
  }
}

/** Valida che ogni attività generi almeno uno slot e la policy min. */
function validateEventInput(input: {
  activityPolicy: 'all' | 'min' | 'free'
  minActivities: number
  allowChildren: boolean
  allowCompanions: boolean
  maxCompanionsPerRegistration: number
  maxCompanionsWithChildren?: number
  activities: Array<{ start: string; end: string; slotDurationMinutes: number; capacityPerSlot: number }>
}): string | null {
  if (input.activities.length === 0) return 'Aggiungi almeno un\u2019attività'
  for (const a of input.activities) {
    const slots = generateSlots('tmp', new Date(a.start).toISOString(), new Date(a.end).toISOString(), a.slotDurationMinutes, a.capacityPerSlot)
    if (slots.length === 0) {
      return 'Un\u2019attività non genera slot: controlla finestra oraria e durata'
    }
  }
  if (
    input.activityPolicy === 'min' &&
    (input.minActivities < 1 || input.minActivities > input.activities.length)
  ) {
    return 'Il minimo di attività deve essere tra 1 e il numero di attività'
  }
  if (
    input.allowChildren &&
    input.allowCompanions &&
    input.maxCompanionsWithChildren !== undefined &&
    input.maxCompanionsWithChildren > input.maxCompanionsPerRegistration
  ) {
    return 'Il massimo Ospiti con Figli non può superare il massimo Ospiti'
  }
  return null
}

export const create = mutation({
  args: eventInput,
  handler: async (ctx, args) => {
    await requireAdmin(ctx)

    const error = validateEventInput(args)
    if (error) throw new Error(error)

    let checkInPasswordHash: string | null = null
    let scanUnlockToken: string | null = null
    if (args.checkInAccess === 'password') {
      const pwd = (args.checkInPassword ?? '').trim()
      if (pwd.length < 4) {
        throw new Error('Imposta una password (min 4 caratteri) per l\u2019accesso protetto al check-in')
      }
      checkInPasswordHash = await hashCheckInPassword(pwd)
      scanUnlockToken = randomToken()
    }

    const eventId = await ctx.db.insert('events', {
      title: args.title,
      description: args.description,
      location: args.location,
      imageStorageId: args.imageStorageId,
      activityPolicy: args.activityPolicy,
      minActivities: normalizeMinActivities(args.activityPolicy, args.minActivities, args.activities.length),
      allowOverlap: args.allowOverlap,
      checkInToleranceMinutes: args.checkInToleranceMinutes,
      allowQrReuse: args.allowQrReuse,
      requireAccount: args.requireAccount,
      confirmParticipation: args.confirmParticipation,
      collectNames: args.collectNames,
      collectAllergies: args.collectAllergies,
      recordExit: args.recordExit,
      allowChildren: args.allowChildren,
      maxChildrenPerRegistration: args.allowChildren ? args.maxChildrenPerRegistration : 0,
      allowCompanions: args.allowCompanions,
      maxCompanionsPerRegistration: args.allowCompanions ? args.maxCompanionsPerRegistration : 0,
      maxCompanionsWithChildren:
        args.allowChildren && args.allowCompanions ? args.maxCompanionsWithChildren : undefined,
      checkInAccess: args.checkInAccess,
      scanToken: randomToken(),
      checkInPasswordHash,
      scanUnlockToken,
    })

    await insertActivitiesAndSlots(ctx, eventId, args.activities)
    return { id: eventId }
  },
})

/**
 * Aggiorna un Evento. Attività e Slot vengono rigenerati: le vecchie
 * selezioni/check-in che puntavano a slot rimossi diventano orfane, coerente
 * con l'avviso in UI ("gli slot vengono rigenerati").
 */
export const update = mutation({
  args: { eventId: v.id('events'), ...eventInput },
  handler: async (ctx, { eventId, ...args }) => {
    await requireAdmin(ctx)
    const existing = await ctx.db.get(eventId)
    if (!existing) throw new Error('Evento non trovato')

    const error = validateEventInput(args)
    if (error) throw new Error(error)

    let checkInPasswordHash = existing.checkInPasswordHash
    let scanUnlockToken = existing.scanUnlockToken
    if (args.checkInAccess !== 'password') {
      checkInPasswordHash = null
      scanUnlockToken = null
    } else {
      const pwd = (args.checkInPassword ?? '').trim()
      if (pwd.length > 0) {
        checkInPasswordHash = await hashCheckInPassword(pwd)
        scanUnlockToken = randomToken()
      }
      if (!checkInPasswordHash) {
        throw new Error('Imposta una password per l\u2019accesso protetto al check-in')
      }
    }

    // Rimuove il file precedente se l'immagine è cambiata o è stata tolta.
    if (existing.imageStorageId && existing.imageStorageId !== args.imageStorageId) {
      await ctx.storage.delete(existing.imageStorageId)
    }

    await ctx.db.patch(eventId, {
      title: args.title,
      description: args.description,
      location: args.location,
      imageStorageId: args.imageStorageId,
      activityPolicy: args.activityPolicy,
      minActivities: normalizeMinActivities(args.activityPolicy, args.minActivities, args.activities.length),
      allowOverlap: args.allowOverlap,
      checkInToleranceMinutes: args.checkInToleranceMinutes,
      allowQrReuse: args.allowQrReuse,
      requireAccount: args.requireAccount,
      confirmParticipation: args.confirmParticipation,
      collectNames: args.collectNames,
      collectAllergies: args.collectAllergies,
      recordExit: args.recordExit,
      allowChildren: args.allowChildren,
      maxChildrenPerRegistration: args.allowChildren ? args.maxChildrenPerRegistration : 0,
      allowCompanions: args.allowCompanions,
      maxCompanionsPerRegistration: args.allowCompanions ? args.maxCompanionsPerRegistration : 0,
      maxCompanionsWithChildren:
        args.allowChildren && args.allowCompanions ? args.maxCompanionsWithChildren : undefined,
      checkInAccess: args.checkInAccess,
      checkInPasswordHash,
      scanUnlockToken,
    })

    // Rigenera attività e slot.
    const oldActivities = await ctx.db
      .query('activities')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()
    for (const a of oldActivities) {
      const oldSlots = await ctx.db
        .query('slots')
        .withIndex('by_activity', (q) => q.eq('activityId', a._id))
        .collect()
      for (const s of oldSlots) await ctx.db.delete(s._id)
      await ctx.db.delete(a._id)
    }
    await insertActivitiesAndSlots(ctx, eventId, args.activities)

    return { id: eventId }
  },
})

export const remove = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(eventId)
    if (!event) throw new Error('Evento non trovato')

    // Cascade delete.
    const collections = ['activities', 'slots', 'registrations', 'persons', 'slotSelections'] as const
    for (const table of collections) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_event', (q) => q.eq('eventId', eventId))
        .collect()
      for (const row of rows) await ctx.db.delete(row._id)
    }
    const checkIns = await ctx.db
      .query('activityCheckIns')
      .filter((q) => q.eq(q.field('eventId'), eventId))
      .collect()
    for (const c of checkIns) await ctx.db.delete(c._id)
    const staff = await ctx.db
      .query('eventStaff')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()
    for (const s of staff) await ctx.db.delete(s._id)

    if (event.imageStorageId) await ctx.storage.delete(event.imageStorageId)

    await ctx.db.delete(eventId)
    return { success: true }
  },
})

/**
 * URL monouso per caricare l'immagine dell'Evento su Convex file storage.
 * Il client fa POST del blob ritagliato e riceve lo storageId da salvare.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const rotateScanToken = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(eventId)
    if (!event) throw new Error('Evento non trovato')
    const scanToken = randomToken()
    await ctx.db.patch(eventId, { scanToken })
    return { scanToken }
  },
})

/**
 * Aggiorna le impostazioni di incorporamento di un Evento.
 * Autorizzato a ogni operatore dell'Evento (admin o staff associato).
 */
export const setEmbedSettings = mutation({
  args: {
    eventId: v.id('events'),
    embedEnabled: v.boolean(),
    allowedOrigins: v.array(v.string()),
  },
  handler: async (ctx, { eventId, embedEnabled, allowedOrigins }) => {
    const event = await ctx.db.get(eventId)
    if (!event) throw new Error('Evento non trovato')
    await requireCanOperate(ctx, event)

    const { valid, invalid } = parseAllowedOrigins(allowedOrigins)
    if (invalid.length > 0) {
      throw new Error(
        `Origini non valide: ${invalid.join(', ')}. Usa il formato https://sito.com o https://*.sito.com`,
      )
    }
    if (embedEnabled && valid.length === 0) {
      throw new Error('Aggiungi almeno un dominio autorizzato per abilitare l\u2019incorporamento')
    }

    await ctx.db.patch(eventId, { embedEnabled, allowedOrigins: valid })
    return { embedEnabled, allowedOrigins: valid }
  },
})

/**
 * Configurazione di incorporamento per l'endpoint HTTP consumato dal proxy
 * Next.js per impostare la CSP `frame-ancestors`. Interno: non esposto ai client.
 */
export const getEmbedConfig = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const normalizedId = ctx.db.normalizeId('events', eventId)
    if (!normalizedId) return { embedEnabled: false, allowedOrigins: [] }
    const event = await ctx.db.get(normalizedId)
    if (!event) return { embedEnabled: false, allowedOrigins: [] }
    return {
      embedEnabled: event.embedEnabled ?? false,
      allowedOrigins: event.allowedOrigins ?? [],
    }
  },
})

export const setCheckInPassword = mutation({
  args: { eventId: v.id('events'), password: v.string() },
  handler: async (ctx, { eventId, password }) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(eventId)
    if (!event) throw new Error('Evento non trovato')
    const trimmed = password.trim()
    if (trimmed.length < 4) throw new Error('La password deve avere almeno 4 caratteri')
    await ctx.db.patch(eventId, {
      checkInPasswordHash: await hashCheckInPassword(trimmed),
      scanUnlockToken: randomToken(),
    })
    return { success: true }
  },
})
