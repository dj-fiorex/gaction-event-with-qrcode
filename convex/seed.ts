import { action, internalMutation, internalQuery } from './_generated/server'
import { v } from 'convex/values'
import { getAuthUserId, createAccount } from '@convex-dev/auth/server'
import { internal } from './_generated/api'
import { generateSlots } from '../lib/slots'
import { generateTicketCode, hashCheckInPassword, randomToken } from './model'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const hasAdmin = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const admin = await ctx.db
      .query('users')
      .filter((q) => q.eq(q.field('role'), 'admin'))
      .first()
    return admin !== null
  },
})

export const emailExists = internalQuery({
  args: { email: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { email }) => {
    const u = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .unique()
    return u !== null
  },
})

/**
 * Popola dati demo se il DB è vuoto (idempotente sulla presenza di eventi).
 * Restituisce true se ha inserito, false se già presenti.
 */
export const populateDemo = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const existing = await ctx.db.query('events').first()
    if (existing) return false

    const now = Date.now()
    const at = (offset: number) => new Date(now + offset).toISOString()

    async function buildActivity(
      eventId: import('./_generated/dataModel').Id<'events'>,
      title: string,
      start: string,
      end: string,
      slotDurationMinutes: number,
      capacityPerSlot: number,
      order: number,
    ) {
      const activityId = await ctx.db.insert('activities', {
        eventId,
        title,
        start,
        end,
        slotDurationMinutes,
        capacityPerSlot,
        order,
      })
      const slots = generateSlots(activityId, start, end, slotDurationMinutes, capacityPerSlot)
      const slotIds: import('./_generated/dataModel').Id<'slots'>[] = []
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        slotIds.push(
          await ctx.db.insert('slots', {
            eventId,
            activityId,
            start: s.start,
            end: s.end,
            capacity: s.capacity,
            order: i,
          }),
        )
      }
      return { activityId, slotIds }
    }

    // --- Evento 1: Family Day (private, no QR reuse, bambini + ospiti) ---
    const familyBase = now + DAY * 20
    const familyDayId = await ctx.db.insert('events', {
      title: 'Family Day Aziendale 2026',
      description:
        'Una giornata dedicata ai dipendenti e alle loro famiglie con laboratori creativi e spettacoli dal vivo.',
      location: 'Parco delle Cascine, Firenze',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: true,
      maxChildrenPerRegistration: 4,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      checkInAccess: 'private',
      scanToken: randomToken(),
      checkInPasswordHash: null,
      scanUnlockToken: null,
    })
    const fdLab = await buildActivity(
      familyDayId,
      'Laboratorio creativo',
      at(DAY * 20),
      new Date(familyBase + 180 * MIN).toISOString(),
      30,
      10,
      0,
    )
    await buildActivity(
      familyDayId,
      'Spettacolo dal vivo',
      new Date(familyBase + 240 * MIN).toISOString(),
      new Date(familyBase + 360 * MIN).toISOString(),
      60,
      40,
      1,
    )

    // Prenotazione demo con Utente + bambino, check-in evento effettuato.
    const reg1 = await ctx.db.insert('registrations', {
      eventId: familyDayId,
      contactEmail: 'mario.rossi@example.com',
    })
    const p1 = await ctx.db.insert('persons', {
      registrationId: reg1,
      eventId: familyDayId,
      name: 'Mario Rossi',
      category: 'user',
      age: 38,
      ticketCode: generateTicketCode(),
      eventCheckInAt: at(-HOUR),
      eventCheckInCount: 1,
      eventCheckInLastAt: at(-HOUR),
    })
    await ctx.db.insert('persons', {
      registrationId: reg1,
      eventId: familyDayId,
      name: 'Giulia Rossi',
      category: 'child',
      age: 7,
      ticketCode: generateTicketCode(),
      eventCheckInAt: null,
      eventCheckInCount: 0,
      eventCheckInLastAt: null,
    })
    await ctx.db.insert('slotSelections', {
      registrationId: reg1,
      eventId: familyDayId,
      activityId: fdLab.activityId,
      slotId: fdLab.slotIds[0],
    })
    await ctx.db.insert('activityCheckIns', {
      personId: p1,
      eventId: familyDayId,
      activityId: fdLab.activityId,
      slotId: fdLab.slotIds[0],
      at: at(-30 * MIN),
      count: 1,
      lastAt: at(-30 * MIN),
    })

    // --- Evento 2: Tech Summit (password, QR reuse, policy all) ---
    const summitBase = now + DAY * 40
    const summitId = await ctx.db.insert('events', {
      title: 'Tech Summit 2026',
      description:
        'Conferenza tecnica con keynote e sessioni parallele. Accesso al check-in protetto da password condivisa con lo staff.',
      location: 'MiCo, Milano',
      activityPolicy: 'all',
      minActivities: 0,
      allowOverlap: true,
      checkInToleranceMinutes: 30,
      allowQrReuse: true,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess: 'password',
      scanToken: randomToken(),
      checkInPasswordHash: await hashCheckInPassword('summit2026'),
      scanUnlockToken: randomToken(),
    })
    await buildActivity(
      summitId,
      'Keynote di apertura',
      new Date(summitBase).toISOString(),
      new Date(summitBase + 90 * MIN).toISOString(),
      90,
      200,
      0,
    )
    await buildActivity(
      summitId,
      'Workshop pratici',
      new Date(summitBase + 120 * MIN).toISOString(),
      new Date(summitBase + 300 * MIN).toISOString(),
      60,
      30,
      1,
    )

    return true
  },
})

/**
 * Bootstrap una-tantum: crea il primo account admin (se assente) e popola i dati demo.
 * Sicurezza: se esiste già un admin, la creazione richiede che il chiamante sia admin.
 */
export const bootstrap = action({
  args: {
    adminEmail: v.string(),
    adminPassword: v.string(),
    adminName: v.optional(v.string()),
    withDemoData: v.optional(v.boolean()),
  },
  returns: v.object({
    createdAdmin: v.boolean(),
    seededDemo: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ createdAdmin: boolean; seededDemo: boolean }> => {
    const adminExists = await ctx.runQuery(internal.seed.hasAdmin, {})

    if (adminExists) {
      // Bootstrap già eseguito: solo un admin autenticato può ri-lanciarlo.
      const callerId = await getAuthUserId(ctx)
      const isAdmin = await ctx.runQuery(internal.accounts.requireAdminInternal, {
        userId: callerId,
      })
      if (!isAdmin) {
        throw new Error('Bootstrap già eseguito: accesso riservato agli amministratori')
      }
    }

    const email = args.adminEmail.trim().toLowerCase()
    let createdAdmin = false
    if (!adminExists) {
      if (args.adminPassword.length < 8) {
        throw new Error('La password admin deve avere almeno 8 caratteri')
      }
      if (await ctx.runQuery(internal.seed.emailExists, { email })) {
        throw new Error('Esiste già un account con questa email')
      }
      await createAccount(ctx, {
        provider: 'password',
        account: { id: email, secret: args.adminPassword },
        profile: { email, name: args.adminName?.trim() || 'Amministratore', role: 'admin' },
      })
      createdAdmin = true
    }

    let seededDemo = false
    if (args.withDemoData ?? true) {
      seededDemo = await ctx.runMutation(internal.seed.populateDemo, {})
    }

    return { createdAdmin, seededDemo }
  },
})
