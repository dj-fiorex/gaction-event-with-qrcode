import { ConvexError, v, type Infer } from 'convex/values'
import { internalQuery, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
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
// Stessa regola per chi scrive il campo e per chi lo rilegge per comporre l'email.
import { normalizeEmailCopy } from '../lib/email-content'

const activityInput = v.object({
  /**
   * Identità dell'Attività attraverso la modifica (ADR 0008): il form rimanda
   * l'id di ogni Attività già persistita, le nuove arrivano senza. È
   * `optional` e non `union(..., null)` perché `create` non ne ha nessuna.
   */
  id: v.optional(v.id('activities')),
  title: v.string(),
  start: v.string(),
  end: v.string(),
  slotDurationMinutes: v.number(),
  capacityPerSlot: v.number(),
  /**
   * Attività ad accesso libero (ADR 0011). Assente = Attività a fasce.
   * Con il flag attivo Durata e capienza arrivano comunque (il form manda
   * l'oggetto intero) ma non vengono lette da nessuno.
   */
  freeAccess: v.optional(v.boolean()),
})

const eventInput = {
  title: v.string(),
  description: v.string(),
  location: v.string(),
  imageStorageId: v.optional(v.id('_storage')),
  /**
   * Date proprie dell'Evento (ADR 0009). Assenti = derivate dalle Attività.
   * Stringa vuota = «tolta»: il form manda comunque il campo, e un campo
   * svuotato deve cancellare la dichiarazione, non persisterne una vuota.
   */
  startsAt: v.optional(v.string()),
  endsAt: v.optional(v.string()),
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
  emailSubject: v.optional(v.string()),
  emailBody: v.optional(v.string()),
  /**
   * Informativa privacy (ADR 0012). Vuota = nessuna casella nel form e nessun
   * vincolo nelle mutation. Riscrivibile in ogni momento: le risposte già
   * raccolte se ne portano una copia e non cambiano.
   */
  privacyNotice: v.optional(v.string()),
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

/** Persone di un insieme di Prenotazioni. */
async function countPersons(
  ctx: QueryCtx,
  registrationIds: Set<Id<'registrations'>>,
): Promise<number> {
  let total = 0
  for (const registrationId of registrationIds) {
    const persons = await ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect()
    total += persons.length
  }
  return total
}

/**
 * Quante Prenotazioni e quante Persone perderebbero la selezione se ciascuna
 * Attività — o una sua singola fascia — sparisse (ADR 0008). Alimenta l'avviso
 * che il form di modifica mostra prima di salvare: togliere un'Attività
 * prenotata, o cambiarne durata e orari fino a spostarne le fasce, non è
 * un'operazione che l'admin debba scoprire dopo.
 *
 * Le fasce senza Prenotazioni non compaiono: l'avviso non ha nulla da dirne.
 * Solo admin.
 */
export const activityRegistrationImpact = query({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)

    const activities = await ctx.db
      .query('activities')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect()
    activities.sort((a, b) => a.order - b.order)

    const impact = []
    for (const activity of activities) {
      const slots = await ctx.db
        .query('slots')
        .withIndex('by_activity', (q) => q.eq('activityId', activity._id))
        .collect()
      slots.sort((a, b) => a.order - b.order)

      // Una Prenotazione sceglie un solo Slot per Attività, ma il conteggio
      // passa comunque da un Set: due selezioni sulla stessa Attività sarebbero
      // pur sempre una Prenotazione sola per chi legge l'avviso.
      const perActivity = new Set<Id<'registrations'>>()
      const perSlot = []
      for (const slot of slots) {
        const selections = await ctx.db
          .query('slotSelections')
          .withIndex('by_slot', (q) => q.eq('slotId', slot._id))
          .collect()
        const registrationIds = new Set(selections.map((s) => s.registrationId))
        for (const registrationId of registrationIds) perActivity.add(registrationId)
        if (registrationIds.size === 0) continue
        perSlot.push({
          start: slot.start,
          end: slot.end,
          registrations: registrationIds.size,
          persons: await countPersons(ctx, registrationIds),
        })
      }

      impact.push({
        activityId: activity._id,
        registrations: perActivity.size,
        persons: await countPersons(ctx, perActivity),
        slots: perSlot,
      })
    }
    return impact
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

/**
 * Le date dichiarate come vanno persistite (ADR 0009): l'istante assoluto se
 * l'admin ne ha scritto uno, `undefined` se ha lasciato il campo vuoto. È
 * `undefined` e non stringa vuota perché «assente» è il campo che non c'è —
 * la lettura risolve `??` sulla derivazione, e `''` non è nullish.
 *
 * Torna sempre entrambe le chiavi: un `patch` che le omettesse non potrebbe
 * mai togliere a un Evento una dichiarazione già fatta.
 */
function normalizeEventDates(input: { startsAt?: string; endsAt?: string }): {
  startsAt: string | undefined
  endsAt: string | undefined
} {
  return { startsAt: normalizeDeclaredDate(input.startsAt), endsAt: normalizeDeclaredDate(input.endsAt) }
}

/**
 * Un campo data dell'Evento come arriva dal form, nei suoi tre casi: vuoto
 * («non dichiarata», scelta legittima dell'admin), un istante, o qualcosa che
 * una data non è. Sono tre e non due: confondere il vuoto con il non valido
 * significa o scrivere `Invalid Date` in tabella o cancellare in silenzio una
 * dichiarazione che l'admin ha appena scritto.
 */
type DeclaredDate =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'instant'; instant: number }

function readDeclaredDate(value: string | undefined): DeclaredDate {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return { kind: 'absent' }
  const instant = new Date(trimmed).getTime()
  return Number.isNaN(instant) ? { kind: 'invalid' } : { kind: 'instant', instant }
}

function normalizeDeclaredDate(value: string | undefined): string | undefined {
  const declared = readDeclaredDate(value)
  return declared.kind === 'instant' ? new Date(declared.instant).toISOString() : undefined
}

/**
 * Policy di selezione e minimo come vanno persistiti (ADR 0010): senza Attività
 * non hanno referente, quindi si scrivono normalizzati a `free`/`0`. Lasciare
 * nel documento la policy che l'admin aveva scelto quando le Attività c'erano
 * significherebbe conservare un valore scelto per un mondo che non esiste, che
 * *sembra* attivo a chiunque rilegga l'Evento.
 */
function normalizeSelectionPolicy(
  policy: 'all' | 'min' | 'free',
  min: number,
  count: number,
): { activityPolicy: 'all' | 'min' | 'free'; minActivities: number } {
  if (count === 0) return { activityPolicy: 'free', minActivities: 0 }
  return { activityPolicy: policy, minActivities: policy === 'min' ? min : 0 }
}

/** Un'Attività così come la manda il form: derivata dal validator, mai riscritta a mano. */
type ActivityInput = Infer<typeof activityInput>

/**
 * Cancella uno Slot e le selezioni che lo prenotavano.
 *
 * «Si cancella l'impegno, non il fatto» (ADR 0008): sparisce la riga di
 * `slotSelections`, che è un'obbligazione verso uno Slot che non esiste più.
 * La Prenotazione, le sue Persone, i loro biglietti e i check-in già
 * registrati non vengono toccati: restano validi all'Ingresso e sulle altre
 * Attività, e continuano a contare nella Visita dello Stato consolidato.
 */
async function deleteSlotWithSelections(ctx: MutationCtx, slotId: Id<'slots'>): Promise<void> {
  const selections = await ctx.db
    .query('slotSelections')
    .withIndex('by_slot', (q) => q.eq('slotId', slotId))
    .collect()
  for (const selection of selections) await ctx.db.delete(selection._id)
  await ctx.db.delete(slotId)
}

/**
 * Riallinea gli Slot di un'Attività alla sua finestra oraria conservandone
 * l'identità: uno Slot rigenerato che coincide per `start`/`end` con uno
 * esistente ne conserva il documento e l'id, quindi anche il posto occupato
 * dalle Prenotazioni. Spariscono solo gli Slot che la nuova finestra non
 * copre più.
 */
async function syncSlots(
  ctx: MutationCtx,
  eventId: Id<'events'>,
  activityId: Id<'activities'>,
  activity: {
    start: string
    end: string
    slotDurationMinutes: number
    capacityPerSlot: number
    freeAccess?: boolean
  },
): Promise<void> {
  const existing = await ctx.db
    .query('slots')
    .withIndex('by_activity', (q) => q.eq('activityId', activityId))
    .collect()
  const byWindow = new Map(existing.map((s) => [`${s.start}|${s.end}`, s]))
  const kept = new Set<Id<'slots'>>()

  const generated = generateSlots(
    activityId,
    activity.start,
    activity.end,
    activity.slotDurationMinutes,
    activity.capacityPerSlot,
    activity.freeAccess ?? false,
  )
  for (let order = 0; order < generated.length; order++) {
    const slot = generated[order]
    const match = byWindow.get(`${slot.start}|${slot.end}`)
    if (match) {
      kept.add(match._id)
      await ctx.db.patch(match._id, { capacity: slot.capacity, order })
      continue
    }
    await ctx.db.insert('slots', {
      eventId,
      activityId,
      start: slot.start,
      end: slot.end,
      capacity: slot.capacity,
      order,
    })
  }

  for (const slot of existing) {
    if (kept.has(slot._id)) continue
    await deleteSlotWithSelections(ctx, slot._id)
  }
}

/** Cancella un'Attività, i suoi Slot e le selezioni che li prenotavano. */
async function deleteActivityWithSlots(
  ctx: MutationCtx,
  activityId: Id<'activities'>,
): Promise<void> {
  const slots = await ctx.db
    .query('slots')
    .withIndex('by_activity', (q) => q.eq('activityId', activityId))
    .collect()
  for (const slot of slots) await deleteSlotWithSelections(ctx, slot._id)
  await ctx.db.delete(activityId)
}

/**
 * Allinea Attività e Slot di un Evento alla lista inviata dal form.
 *
 * Non è più «cancella e reinserisci» (ADR 0008): è un diff fra la lista
 * inviata e quella persistita. Patcha le Attività che il form ha rimandato
 * con il proprio id, inserisce quelle nuove e cancella solo quelle che
 * l'admin ha davvero tolto. Un id che non appartiene a questo Evento — form
 * aperto su un'altra scheda, o payload manomesso — non identifica nulla e
 * l'Attività viene inserita come nuova: mai patchare il documento di un
 * Evento altrui.
 *
 * `create` la chiama sullo stesso percorso: senza Attività persistite il diff
 * degenera in soli inserimenti.
 */
async function syncActivitiesAndSlots(
  ctx: MutationCtx,
  eventId: Id<'events'>,
  activities: ActivityInput[],
): Promise<void> {
  const existing = await ctx.db
    .query('activities')
    .withIndex('by_event', (q) => q.eq('eventId', eventId))
    .collect()
  const byId = new Map(existing.map((a) => [a._id, a]))
  const kept = new Set<Id<'activities'>>()

  for (let order = 0; order < activities.length; order++) {
    const activity = activities[order]
    const fields = {
      title: activity.title,
      start: new Date(activity.start).toISOString(),
      end: new Date(activity.end).toISOString(),
      slotDurationMinutes: activity.slotDurationMinutes,
      capacityPerSlot: activity.capacityPerSlot,
      freeAccess: activity.freeAccess ?? false,
      order,
    }

    // Un id già consumato non identifica una seconda Attività: due voci con lo
    // stesso id fonderebbero in una sola, portandosi via le selezioni dell'altra.
    const persisted =
      activity.id && !kept.has(activity.id) ? byId.get(activity.id) : undefined
    let activityId: Id<'activities'>
    if (persisted) {
      activityId = persisted._id
      kept.add(activityId)
      await ctx.db.patch(activityId, fields)
    } else {
      activityId = await ctx.db.insert('activities', { eventId, ...fields })
    }

    await syncSlots(ctx, eventId, activityId, fields)
  }

  // Solo le Attività che l'admin ha davvero tolto: con esse i loro Slot e le
  // selezioni che li prenotavano. I `activityCheckIns` restano deliberatamente
  // in tabella — sono storia, non puntatori vivi (ADR 0008).
  for (const activity of existing) {
    if (kept.has(activity._id)) continue
    await deleteActivityWithSlots(ctx, activity._id)
  }
}

/** Valida che ogni attività generi almeno uno slot e la policy min. */
function validateEventInput(input: {
  startsAt?: string
  endsAt?: string
  activityPolicy: 'all' | 'min' | 'free'
  minActivities: number
  allowChildren: boolean
  allowCompanions: boolean
  maxCompanionsPerRegistration: number
  maxCompanionsWithChildren?: number
  activities: Array<{
    start: string
    end: string
    slotDurationMinutes: number
    capacityPerSlot: number
    freeAccess?: boolean
  }>
}): string | null {
  // Date proprie dell'Evento: la fine dichiarata richiede l'inizio ed è
  // successiva, l'inizio sta in piedi da solo. Il perché sta nell'ADR 0009.
  const declaredStart = readDeclaredDate(input.startsAt)
  const declaredEnd = readDeclaredDate(input.endsAt)
  if (declaredStart.kind === 'invalid' || declaredEnd.kind === 'invalid') {
    return 'Data dell\u2019evento non valida'
  }
  if (declaredEnd.kind === 'instant' && declaredStart.kind !== 'instant') {
    return 'Per dichiarare la fine dell\u2019evento serve anche l\u2019inizio'
  }
  if (
    declaredStart.kind === 'instant' &&
    declaredEnd.kind === 'instant' &&
    declaredEnd.instant <= declaredStart.instant
  ) {
    return 'La fine dell\u2019evento deve essere successiva all\u2019inizio'
  }

  // Nessun «almeno un'Attività» (ADR 0010): un Evento può non averne, ed è una
  // sua forma legittima e permanente — una cena, un'assemblea, un open day.
  for (const a of input.activities) {
    const slots = generateSlots('tmp', new Date(a.start).toISOString(), new Date(a.end).toISOString(), a.slotDurationMinutes, a.capacityPerSlot, a.freeAccess ?? false)
    if (slots.length === 0) {
      return 'Un\u2019attività non genera slot: controlla finestra oraria e durata'
    }
  }
  // Il minimo si valida solo dove c'è una lista da confrontare: senza Attività
  // la policy viene normalizzata a `free`/`0` e non c'è nulla da rifiutare.
  if (
    input.activities.length > 0 &&
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
    if (error) throw new ConvexError(error)

    let checkInPasswordHash: string | null = null
    let scanUnlockToken: string | null = null
    if (args.checkInAccess === 'password') {
      const pwd = (args.checkInPassword ?? '').trim()
      if (pwd.length < 4) {
        throw new ConvexError('Imposta una password (min 4 caratteri) per l\u2019accesso protetto al check-in')
      }
      checkInPasswordHash = await hashCheckInPassword(pwd)
      scanUnlockToken = randomToken()
    }

    const eventId = await ctx.db.insert('events', {
      title: args.title,
      description: args.description,
      location: args.location,
      imageStorageId: args.imageStorageId,
      ...normalizeEventDates(args),
      ...normalizeSelectionPolicy(args.activityPolicy, args.minActivities, args.activities.length),
      allowOverlap: args.allowOverlap,
      checkInToleranceMinutes: args.checkInToleranceMinutes,
      allowQrReuse: args.allowQrReuse,
      requireAccount: args.requireAccount,
      confirmParticipation: args.confirmParticipation,
      collectNames: args.collectNames,
      collectAllergies: args.collectAllergies,
      recordExit: args.recordExit,
      emailSubject: normalizeEmailCopy(args.emailSubject),
      emailBody: normalizeEmailCopy(args.emailBody),
      privacyNotice: normalizeEmailCopy(args.privacyNotice),
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

    await syncActivitiesAndSlots(ctx, eventId, args.activities)
    return { id: eventId }
  },
})

/**
 * Aggiorna un Evento. Attività e Slot conservano la propria identità
 * attraverso la modifica (ADR 0008): salvare senza toccare il programma non
 * sposta una virgola delle Prenotazioni. È l'unico punto che può distruggere
 * dati di Prenotazioni altrui, quindi la cura è concentrata in
 * `syncActivitiesAndSlots`.
 */
export const update = mutation({
  args: { eventId: v.id('events'), ...eventInput },
  handler: async (ctx, { eventId, ...args }) => {
    await requireAdmin(ctx)
    const existing = await ctx.db.get(eventId)
    if (!existing) throw new ConvexError('Evento non trovato')

    const error = validateEventInput(args)
    if (error) throw new ConvexError(error)

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
        throw new ConvexError('Imposta una password per l\u2019accesso protetto al check-in')
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
      ...normalizeEventDates(args),
      ...normalizeSelectionPolicy(args.activityPolicy, args.minActivities, args.activities.length),
      allowOverlap: args.allowOverlap,
      checkInToleranceMinutes: args.checkInToleranceMinutes,
      allowQrReuse: args.allowQrReuse,
      requireAccount: args.requireAccount,
      confirmParticipation: args.confirmParticipation,
      collectNames: args.collectNames,
      collectAllergies: args.collectAllergies,
      recordExit: args.recordExit,
      emailSubject: normalizeEmailCopy(args.emailSubject),
      emailBody: normalizeEmailCopy(args.emailBody),
      privacyNotice: normalizeEmailCopy(args.privacyNotice),
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

    await syncActivitiesAndSlots(ctx, eventId, args.activities)

    return { id: eventId }
  },
})

export const remove = mutation({
  args: { eventId: v.id('events') },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(eventId)
    if (!event) throw new ConvexError('Evento non trovato')

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
    if (!event) throw new ConvexError('Evento non trovato')
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
    if (!event) throw new ConvexError('Evento non trovato')
    await requireCanOperate(ctx, event)

    const { valid, invalid } = parseAllowedOrigins(allowedOrigins)
    if (invalid.length > 0) {
      throw new ConvexError(
        `Origini non valide: ${invalid.join(', ')}. Usa il formato https://sito.com o https://*.sito.com`,
      )
    }
    if (embedEnabled && valid.length === 0) {
      throw new ConvexError('Aggiungi almeno un dominio autorizzato per abilitare l\u2019incorporamento')
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
    if (!event) throw new ConvexError('Evento non trovato')
    const trimmed = password.trim()
    if (trimmed.length < 4) throw new ConvexError('La password deve avere almeno 4 caratteri')
    await ctx.db.patch(eventId, {
      checkInPasswordHash: await hashCheckInPassword(trimmed),
      scanUnlockToken: randomToken(),
    })
    return { success: true }
  },
})
