import { mutation, query } from './_generated/server'
import { ConvexError, v, type Infer } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { canOperateEvent, verifyCheckInPassword } from './model'
import { statusOfPerson, type PersonStatus } from '../lib/person-status'

const checkInMode = v.union(v.literal('event'), v.literal('activity'), v.literal('exit'))

const personSummaryValidator = v.object({
  /** Nome e cognome in due campi (ADR 0017); il cognome è solo dell'Iscritto. */
  firstName: v.string(),
  lastName: v.union(v.string(), v.null()),
  category: v.union(v.literal('user'), v.literal('child'), v.literal('companion')),
  age: v.union(v.number(), v.null()),
  /** Allergie e intolleranze dichiarate (issue #37). null = nessuna dichiarazione. */
  allergies: v.union(v.string(), v.null()),
  ticketCode: v.string(),
})

const momentValidator = v.object({
  at: v.union(v.string(), v.null()),
  count: v.number(),
  lastAt: v.union(v.string(), v.null()),
})

/** Stato consolidato: i tre momenti di Check-in della Persona (issue #39). */
const personStatusValidator = v.object({
  entry: momentValidator,
  activity: momentValidator,
  exit: momentValidator,
})

const checkInResultValidator = v.object({
  status: v.union(
    v.literal('event-valid'),
    v.literal('event-already'),
    v.literal('activity-valid'),
    v.literal('activity-already'),
    v.literal('exit-valid'),
    v.literal('exit-already'),
    v.literal('exit-not-entered'),
    v.literal('exit-disabled'),
    v.literal('not-registered-activity'),
    v.literal('too-early'),
    v.literal('too-late'),
    v.literal('wrong-event'),
    v.literal('not-found'),
    /** Esito di «Solo verifica»: la Persona è stata letta, nulla è stato scritto. */
    v.literal('lookup'),
  ),
  message: v.string(),
  person: v.optional(personSummaryValidator),
  /** Presente ogni volta che la scansione risolve una Persona. */
  personStatus: v.optional(personStatusValidator),
  eventTitle: v.optional(v.string()),
  activityTitle: v.optional(v.string()),
  slotStart: v.optional(v.string()),
  slotEnd: v.optional(v.string()),
  at: v.optional(v.string()),
  count: v.optional(v.number()),
})

/**
 * Esito di una scansione, in una forma sola. Annotarlo esplicitamente sugli
 * handler tiene il tipo esposto ai client uguale al validator: senza, TypeScript
 * inferisce l'unione dei rami di `return` e chi legge `result.count` deve
 * restringere prima su `status`.
 */
type CheckInResultValue = Infer<typeof checkInResultValidator>

function summarize(person: Doc<'persons'>) {
  return {
    firstName: person.firstName,
    lastName: person.lastName ?? null,
    category: person.category,
    age: person.age,
    allergies: person.allergies ?? null,
    ticketCode: person.ticketCode,
  }
}

/**
 * Rilegge dal database i tre momenti di Check-in della Persona.
 * Va chiamata *dopo* le patch della scansione in corso, così l'esito riporta
 * lo stato come è appena diventato e non come era prima.
 */
async function consolidate(ctx: QueryCtx, personId: Doc<'persons'>['_id']): Promise<PersonStatus> {
  const person = await ctx.db.get(personId)
  if (!person) throw new ConvexError('Persona non trovata')
  const activityCheckIns = await ctx.db
    .query('activityCheckIns')
    .withIndex('by_person', (q) => q.eq('personId', personId))
    .collect()
  return statusOfPerson(person, activityCheckIns)
}

/**
 * Sblocca la scansione di un Evento in modalità password.
 * Ritorna un token opaco che il client invia con ogni check-in.
 */
export const unlockScan = mutation({
  args: { scanToken: v.string(), password: v.string() },
  returns: v.object({ ok: v.boolean(), unlockToken: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query('events')
      .withIndex('by_scanToken', (q) => q.eq('scanToken', args.scanToken))
      .unique()
    if (!event || event.checkInAccess !== 'password') {
      return { ok: false, unlockToken: null }
    }
    const valid = await verifyCheckInPassword(args.password, event.checkInPasswordHash)
    if (!valid) return { ok: false, unlockToken: null }
    return { ok: true, unlockToken: event.scanUnlockToken }
  },
})

/**
 * Check-in transazionale di una Persona tramite ticketCode.
 * Le mutation Convex sono serializzabili: lo stato viene riletto qui dentro,
 * evitando doppi check-in e rientri non consentiti.
 */
export const checkIn = mutation({
  args: {
    eventId: v.id('events'),
    code: v.string(),
    mode: checkInMode,
    activityId: v.optional(v.id('activities')),
    unlockToken: v.optional(v.string()),
  },
  returns: checkInResultValidator,
  handler: async (ctx, args): Promise<CheckInResultValue> => {
    const targetEvent = await ctx.db.get(args.eventId)
    if (!targetEvent) {
      return { status: 'not-found' as const, message: 'Evento non trovato.' }
    }
    const authorized = await canOperateEvent(ctx, targetEvent, args.unlockToken ?? null)
    if (!authorized) {
      throw new ConvexError('Accesso non autorizzato')
    }

    const person = await ctx.db
      .query('persons')
      .withIndex('by_ticketCode', (q) => q.eq('ticketCode', args.code.trim()))
      .unique()
    if (!person) {
      return { status: 'not-found' as const, message: 'QR non riconosciuto.' }
    }

    const outcome = await recordCheckIn(ctx, args, targetEvent, person)
    // I tre momenti sono relativi all'Evento della Persona: allegarli a un QR
    // di un altro Evento li farebbe leggere come se riguardassero questo, e
    // rivelerebbe a chi opera l'Evento A la giornata di chi è iscritto al B.
    if (outcome.status === 'wrong-event') return outcome
    // Lo stato consolidato è riletto *dopo* le scritture di questa scansione:
    // la result card mostra i tre momenti come sono appena diventati.
    return { ...outcome, personStatus: await consolidate(ctx, person._id) }
  },
})

/**
 * Corpo della scansione, una volta risolti Evento e Persona: applica le
 * scritture del momento richiesto e ne descrive l'esito. Lo stato consolidato
 * lo aggiunge il chiamante, così ogni esito lo riporta senza doverselo portare
 * dietro ramo per ramo.
 */
async function recordCheckIn(
  ctx: MutationCtx,
  args: {
    mode: 'event' | 'activity' | 'exit'
    activityId?: Id<'activities'>
  },
  targetEvent: Doc<'events'>,
  person: Doc<'persons'>,
): Promise<Omit<CheckInResultValue, 'personStatus'>> {
  const personSummary = summarize(person)

  if (person.eventId !== targetEvent._id) {
    return {
      status: 'wrong-event' as const,
      message: 'Questo QR appartiene a un altro evento.',
      person: personSummary,
      eventTitle: targetEvent.title,
    }
  }

  const event = targetEvent

  if (args.mode === 'event') {
    const now = new Date().toISOString()
    if (person.eventCheckInAt) {
      if (!event.allowQrReuse) {
        return {
          status: 'event-already' as const,
          message: 'Ingresso già registrato in precedenza.',
          person: personSummary,
          eventTitle: event.title,
          at: person.eventCheckInAt,
          count: person.eventCheckInCount,
        }
      }
      const count = person.eventCheckInCount + 1
      await ctx.db.patch(person._id, { eventCheckInCount: count, eventCheckInLastAt: now })
      return {
        status: 'event-valid' as const,
        message: `Rientro registrato (ingresso n° ${count}).`,
        person: personSummary,
        eventTitle: event.title,
        at: person.eventCheckInAt,
        count,
      }
    }
    await ctx.db.patch(person._id, {
      eventCheckInAt: now,
      eventCheckInCount: 1,
      eventCheckInLastAt: now,
    })
    return {
      status: 'event-valid' as const,
      message: 'Ingresso all’evento consentito.',
      person: personSummary,
      eventTitle: event.title,
      at: now,
      count: 1,
    }
  }

  if (args.mode === 'exit') {
    // Terzo momento di Check-in: attivo solo se l'admin l'ha abilitato.
    if (!event.recordExit) {
      return {
        status: 'exit-disabled' as const,
        message: 'La registrazione dell’uscita non è attiva per questo evento.',
        person: personSummary,
        eventTitle: event.title,
      }
    }
    // Guard rail: un'uscita senza ingresso è una scansione in modalità
    // sbagliata. Blocca e non scrive nulla, per non corrompere i dati.
    if (!person.eventCheckInAt) {
      return {
        status: 'exit-not-entered' as const,
        message: 'Non risulta entrato: registra prima l’ingresso all’evento.',
        person: personSummary,
        eventTitle: event.title,
      }
    }

    const now = new Date().toISOString()
    if (person.eventCheckOutAt) {
      if (!event.allowQrReuse) {
        return {
          status: 'exit-already' as const,
          message: 'Uscita già registrata in precedenza.',
          person: personSummary,
          eventTitle: event.title,
          at: person.eventCheckOutAt,
          count: person.eventCheckOutCount,
        }
      }
      const count = (person.eventCheckOutCount ?? 0) + 1
      await ctx.db.patch(person._id, {
        eventCheckOutCount: count,
        eventCheckOutLastAt: now,
      })
      return {
        status: 'exit-valid' as const,
        message: `Nuova uscita registrata (uscita n° ${count}).`,
        person: personSummary,
        eventTitle: event.title,
        at: person.eventCheckOutAt,
        count,
      }
    }
    await ctx.db.patch(person._id, {
      eventCheckOutAt: now,
      eventCheckOutCount: 1,
      eventCheckOutLastAt: now,
    })
    return {
      status: 'exit-valid' as const,
      message: 'Uscita dall’evento registrata.',
      person: personSummary,
      eventTitle: event.title,
      at: now,
      count: 1,
    }
  }

  // mode === 'activity'
  const activity = args.activityId ? await ctx.db.get(args.activityId) : null
  if (!activity || activity.eventId !== event._id) {
    return {
      status: 'wrong-event' as const,
      message: 'Questa persona non appartiene all’attività selezionata.',
      person: personSummary,
      eventTitle: event.title,
    }
  }

  const selection = await ctx.db
    .query('slotSelections')
    .withIndex('by_registration', (q) => q.eq('registrationId', person.registrationId))
    .filter((q) => q.eq(q.field('activityId'), activity._id))
    .unique()
  const slot = selection ? await ctx.db.get(selection.slotId) : null
  if (!selection || !slot) {
    return {
      status: 'not-registered-activity' as const,
      message: `Non iscritto a "${activity.title}".`,
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
    }
  }

  const now = Date.now()
  const toleranceMs = event.checkInToleranceMinutes * 60_000
  const slotStart = new Date(slot.start).getTime()
  const slotEnd = new Date(slot.end).getTime()

  if (now < slotStart - toleranceMs) {
    return {
      status: 'too-early' as const,
      message: 'Troppo presto: torna nella tua fascia oraria.',
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
      slotStart: slot.start,
      slotEnd: slot.end,
    }
  }
  if (now > slotEnd + toleranceMs) {
    return {
      status: 'too-late' as const,
      message: 'Troppo tardi: la fascia oraria è terminata.',
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
      slotStart: slot.start,
      slotEnd: slot.end,
    }
  }

  const at = new Date().toISOString()
  const already = await ctx.db
    .query('activityCheckIns')
    .withIndex('by_person_activity', (q) =>
      q.eq('personId', person._id).eq('activityId', activity._id),
    )
    .unique()

  if (already) {
    if (!event.allowQrReuse) {
      return {
        status: 'activity-already' as const,
        message: 'Check-in attività già effettuato.',
        person: personSummary,
        eventTitle: event.title,
        activityTitle: activity.title,
        slotStart: slot.start,
        slotEnd: slot.end,
        at: already.at,
        count: already.count,
      }
    }
    const count = already.count + 1
    await ctx.db.patch(already._id, { count, lastAt: at })
    return {
      status: 'activity-valid' as const,
      message: `Rientro in "${activity.title}" registrato (accesso n° ${count}).`,
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
      slotStart: slot.start,
      slotEnd: slot.end,
      at: already.at,
      count,
    }
  }

  await ctx.db.insert('activityCheckIns', {
    personId: person._id,
    eventId: event._id,
    activityId: activity._id,
    slotId: slot._id,
    at,
    count: 1,
    lastAt: at,
  })
  return {
    status: 'activity-valid' as const,
    message: `Accesso a "${activity.title}" consentito.`,
    person: personSummary,
    eventTitle: event.title,
    activityTitle: activity.title,
    slotStart: slot.start,
    slotEnd: slot.end,
    at,
    count: 1,
  }
}

/**
 * «Solo verifica» (issue #39): stato consolidato di una Persona senza scrivere
 * nulla. È una `query` proprio per questo — il runtime Convex non concede
 * `ctx.db.patch`/`insert` alle query, quindi la garanzia di sola lettura è
 * strutturale e non affidata alla disciplina di chi legge il codice.
 * L'autorizzazione dell'operatore è la stessa dei momenti che scrivono.
 */
export const lookup = query({
  args: {
    eventId: v.id('events'),
    code: v.string(),
    unlockToken: v.optional(v.string()),
  },
  returns: checkInResultValidator,
  handler: async (ctx, args): Promise<CheckInResultValue> => {
    const event = await ctx.db.get(args.eventId)
    if (!event) {
      return { status: 'not-found' as const, message: 'Evento non trovato.' }
    }
    const authorized = await canOperateEvent(ctx, event, args.unlockToken ?? null)
    if (!authorized) {
      throw new ConvexError('Accesso non autorizzato')
    }

    const person = await ctx.db
      .query('persons')
      .withIndex('by_ticketCode', (q) => q.eq('ticketCode', args.code.trim()))
      .unique()
    if (!person) {
      return { status: 'not-found' as const, message: 'QR non riconosciuto.' }
    }

    // Come per il check-in: lo stato di un QR di un altro Evento non è lo stato
    // di questo, e non spetta a chi opera qui.
    if (person.eventId !== event._id) {
      return {
        status: 'wrong-event' as const,
        message: 'Questo QR appartiene a un altro evento.',
        person: summarize(person),
        eventTitle: event.title,
      }
    }

    return {
      status: 'lookup' as const,
      message: 'Solo verifica: nessuna registrazione effettuata.',
      person: summarize(person),
      personStatus: await consolidate(ctx, person._id),
      eventTitle: event.title,
    }
  },
})

/** Query realtime: elenco eventi operabili da un utente autenticato (per /staff). */
export const operableEvents = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query('events').collect()
    const result: Array<{ id: string; title: string; location: string; checkInAccess: string }> = []
    for (const event of events) {
      if (await canOperateEvent(ctx, event, null)) {
        result.push({
          id: event._id,
          title: event.title,
          location: event.location,
          checkInAccess: event.checkInAccess,
        })
      }
    }
    return result
  },
})
