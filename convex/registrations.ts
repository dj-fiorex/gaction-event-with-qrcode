import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireAdmin, generateTicketCode, getCurrentUser } from './model'
import { intervalsOverlap } from '../lib/slots'
import { getAuthUserId } from '@convex-dev/auth/server'

// Allergie e intolleranze (issue #37): dichiarazione facoltativa per Persona.
// Opzionale nei validator così i client che non la raccolgono restano validi.
const childInput = v.object({
  name: v.string(),
  age: v.number(),
  allergies: v.optional(v.string()),
})
const companionInput = v.object({ name: v.string(), allergies: v.optional(v.string()) })
const selectionInput = v.object({
  activityId: v.id('activities'),
  slotId: v.id('slots'),
})

/**
 * Lunghezza massima della dichiarazione «Allergie e intolleranze» (issue #37).
 * Deve restare allineata a `allergiesInputSchema` in lib/schemas.ts.
 */
const MAX_ALLERGIES_LENGTH = 300

const REQUIRE_ACCOUNT_LOGIN_ERROR =
  'Per registrarti a questo evento devi accedere con un account Membro verificato'
const REQUIRE_ACCOUNT_ROLE_ERROR =
  'Solo i Membri verificati possono registrarsi a questo evento'
const REQUIRE_ACCOUNT_VERIFICATION_ERROR =
  'Verifica la tua email prima di registrarti a questo evento'
const REQUIRE_ACCOUNT_EMBED_ERROR =
  'Questo evento richiede un account Membro verificato: completa la registrazione dal sito principale'

/* ------------------------------------------------------------------ */
/* Registrazione pubblica                                              */
/* ------------------------------------------------------------------ */

export const register = mutation({
  args: {
    eventId: v.id('events'),
    userName: v.string(),
    contactEmail: v.string(),
    /** Allergie e intolleranze dell'Iscritto (issue #37). */
    userAllergies: v.optional(v.string()),
    children: v.array(childInput),
    companions: v.array(companionInput),
    selections: v.array(selectionInput),
    /** true quando la registrazione arriva dal form incorporato su un sito terzo. */
    embed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new Error('Evento non trovato')

    const caller = await getCurrentUser(ctx)

    if (event.requireAccount && args.embed) {
      throw new Error(REQUIRE_ACCOUNT_EMBED_ERROR)
    }

    if (args.embed && !event.embedEnabled) {
      throw new Error('L\u2019incorporamento non è abilitato per questo evento')
    }

    if (event.requireAccount) {
      if (!caller) throw new Error(REQUIRE_ACCOUNT_LOGIN_ERROR)
      if (caller.role !== 'member') throw new Error(REQUIRE_ACCOUNT_ROLE_ERROR)
      if (caller.emailVerificationTime === undefined || !caller.email) {
        throw new Error(REQUIRE_ACCOUNT_VERIFICATION_ERROR)
      }
    }

    const registrationUserId = caller?._id
    const persistedContactEmail =
      caller?.role === 'member' && caller.email
        ? caller.email.trim().toLowerCase()
        : args.contactEmail

    const children = event.allowChildren ? args.children : []
    const companions = event.allowCompanions ? args.companions : []

    if (children.length > event.maxChildrenPerRegistration) {
      throw new Error(`Puoi aggiungere al massimo ${event.maxChildrenPerRegistration} figli`)
    }

    // Regola del nucleo familiare (issue #35): con almeno un Figlio effettivamente
    // inviato, il cap Ospiti si riduce. Basato sui Figli persistiti, mai su un
    // ramo dichiarato dal client.
    const familyRuleConfigured = event.maxCompanionsWithChildren !== undefined
    const companionsCap =
      familyRuleConfigured && children.length > 0
        ? event.maxCompanionsWithChildren!
        : event.maxCompanionsPerRegistration
    if (companions.length > companionsCap) {
      // «Ospite» ha sostituito «Accompagnatore» in tutta la UI e nei documenti
      // (CONTEXT.md / issue #36), a prescindere dalla regola del nucleo familiare.
      throw new Error(`Puoi aggiungere al massimo ${companionsCap} ospiti`)
    }

    // Carica gli slot selezionati e verifica che appartengano all'Evento.
    const selectedSlots = new Map<Id<'slots'>, Doc<'slots'>>()
    const activityIds = new Set<string>()
    for (const sel of args.selections) {
      if (activityIds.has(sel.activityId)) {
        throw new Error('Puoi selezionare un solo slot per attività')
      }
      activityIds.add(sel.activityId)
      const slot = await ctx.db.get(sel.slotId)
      if (!slot || slot.eventId !== event._id || slot.activityId !== sel.activityId) {
        throw new Error('Selezione attività non valida')
      }
      selectedSlots.set(sel.slotId, slot)
    }

    const activities = await ctx.db
      .query('activities')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()

    // Policy di selezione.
    if (event.activityPolicy === 'all' && activityIds.size !== activities.length) {
      throw new Error('Devi selezionare uno slot per ogni attività')
    }
    if (event.activityPolicy === 'min' && args.selections.length < event.minActivities) {
      throw new Error(`Devi selezionare almeno ${event.minActivities} attività`)
    }
    if (event.activityPolicy === 'free' && args.selections.length === 0) {
      throw new Error('Seleziona almeno un\u2019attività')
    }

    // Sovrapposizioni.
    if (!event.allowOverlap) {
      const chosen = Array.from(selectedSlots.values())
      for (let i = 0; i < chosen.length; i++) {
        for (let j = i + 1; j < chosen.length; j++) {
          if (intervalsOverlap(chosen[i].start, chosen[i].end, chosen[j].start, chosen[j].end)) {
            throw new Error('Hai selezionato slot che si sovrappongono nel tempo')
          }
        }
      }
    }

    const personsCount = 1 + children.length + companions.length

    // Verifica di capacità atomica.
    for (const [slotId, slot] of selectedSlots) {
      const selections = await ctx.db
        .query('slotSelections')
        .withIndex('by_slot', (q) => q.eq('slotId', slotId))
        .collect()
      let taken = 0
      for (const s of selections) {
        const persons = await ctx.db
          .query('persons')
          .withIndex('by_registration', (q) => q.eq('registrationId', s.registrationId))
          .collect()
        taken += persons.length
      }
      const available = slot.capacity - taken
      if (personsCount > available) {
        const activity = await ctx.db.get(slot.activityId)
        throw new Error(
          `Posti insufficienti per "${activity?.title ?? 'attività'}": restano ${available} posti nello slot scelto`,
        )
      }
    }

    // Persiste registrazione, persone e selezioni.
    const registrationId = await ctx.db.insert('registrations', {
      eventId: event._id,
      contactEmail: persistedContactEmail,
      ...(registrationUserId ? { userId: registrationUserId } : {}),
    })

    // Etichetta posizionale (issue #36): con «Raccolta nomi» disattiva, il nome
    // persistito di ogni Figlio/Ospite È l'etichetta progressiva generata qui
    // («Figlio 1..N», «Ospite 1..N»), ignorando qualsiasi nome inviato dal
    // client. L'Iscritto conserva sempre il proprio nome. Assente = attiva.
    const collectNames = event.collectNames ?? true

    // Allergie e intolleranze (issue #37): raccolte solo se l'Evento le chiede,
    // altrimenti qualsiasi dichiarazione inviata dal client viene ignorata.
    // Una dichiarazione vuota o di soli spazi = nessuna allergia dichiarata.
    const collectAllergies = event.collectAllergies ?? false
    const normalizeAllergies = (value: string | undefined): string | null => {
      if (!collectAllergies) return null
      const trimmed = value?.trim() ?? ''
      if (trimmed.length === 0) return null
      // Il limite è applicato server-side: il form lo duplica, ma la mutation
      // non si fida della validazione del client.
      if (trimmed.length > MAX_ALLERGIES_LENGTH) {
        throw new Error(
          `La dichiarazione di allergie e intolleranze non può superare i ${MAX_ALLERGIES_LENGTH} caratteri`,
        )
      }
      return trimmed
    }

    const personsInput: Array<{
      name: string
      category: 'user' | 'child' | 'companion'
      age: number | null
      allergies: string | null
    }> = [
      {
        name: args.userName,
        category: 'user',
        age: null,
        allergies: normalizeAllergies(args.userAllergies),
      },
      ...children.map((c, i) => ({
        name: collectNames ? c.name : `Figlio ${i + 1}`,
        category: 'child' as const,
        age: c.age,
        allergies: normalizeAllergies(c.allergies),
      })),
      ...companions.map((c, i) => ({
        name: collectNames ? c.name : `Ospite ${i + 1}`,
        category: 'companion' as const,
        age: null,
        allergies: normalizeAllergies(c.allergies),
      })),
    ]

    const createdPersons: Array<{
    name: string
    category: 'user' | 'child' | 'companion'
    age: number | null
    allergies: string | null
    ticketCode: string
  }> = []
    for (const p of personsInput) {
      const ticketCode = generateTicketCode()
      await ctx.db.insert('persons', {
        registrationId,
        eventId: event._id,
        name: p.name,
        category: p.category,
        age: p.age,
        ...(p.allergies ? { allergies: p.allergies } : {}),
        ticketCode,
        eventCheckInAt: null,
        eventCheckInCount: 0,
        eventCheckInLastAt: null,
      })
      createdPersons.push({
        name: p.name,
        category: p.category,
        age: p.age,
        allergies: p.allergies,
        ticketCode,
      })
    }

    for (const sel of args.selections) {
      await ctx.db.insert('slotSelections', {
        registrationId,
        eventId: event._id,
        activityId: sel.activityId,
        slotId: sel.slotId,
      })
    }

    // «sì» dopo «no» (ADR 0004): una Prenotazione riuscita cancella la
    // Rinuncia corrispondente per la stessa email (normalizzata) sull'Evento.
    const normalizedEmail = persistedContactEmail.trim().toLowerCase()
    const matchingDecline = await ctx.db
      .query('declines')
      .withIndex('by_event_email', (q) => q.eq('eventId', event._id).eq('email', normalizedEmail))
      .unique()
    if (matchingDecline) await ctx.db.delete(matchingDecline._id)

    return {
      registrationId,
      eventTitle: event.title,
      eventLocation: event.location,
      contactEmail: persistedContactEmail,
      persons: createdPersons,
    }
  },
})

/* ------------------------------------------------------------------ */
/* Query admin: registrazioni con persone, selezioni e check-in        */
/* ------------------------------------------------------------------ */

async function buildRegistrationDTO(
  ctx: Parameters<typeof requireAdmin>[0],
  registration: Doc<'registrations'>,
) {
  const persons = await ctx.db
    .query('persons')
    .withIndex('by_registration', (q) => q.eq('registrationId', registration._id))
    .collect()

  const personDTOs = []
  for (const person of persons) {
    const checkIns = await ctx.db
      .query('activityCheckIns')
      .withIndex('by_person', (q) => q.eq('personId', person._id))
      .collect()
    personDTOs.push({
      id: person._id,
      name: person.name,
      category: person.category,
      age: person.age,
      allergies: person.allergies ?? null,
      ticketCode: person.ticketCode,
      eventCheckInAt: person.eventCheckInAt,
      eventCheckInCount: person.eventCheckInCount,
      eventCheckInLastAt: person.eventCheckInLastAt,
      activityCheckIns: checkIns.map((c) => ({
        activityId: c.activityId,
        slotId: c.slotId,
        at: c.at,
        count: c.count,
        lastAt: c.lastAt,
      })),
    })
  }

  const selections = await ctx.db
    .query('slotSelections')
    .withIndex('by_registration', (q) => q.eq('registrationId', registration._id))
    .collect()

  return {
    id: registration._id,
    eventId: registration.eventId,
    contactEmail: registration.contactEmail,
    createdAt: new Date(registration._creationTime).toISOString(),
    selections: selections.map((s) => ({ activityId: s.activityId, slotId: s.slotId })),
    persons: personDTOs,
  }
}

export const listAll = query({
  args: { eventId: v.optional(v.id('events')) },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx)
    const registrations = eventId
      ? await ctx.db
          .query('registrations')
          .withIndex('by_event', (q) => q.eq('eventId', eventId))
          .collect()
      : await ctx.db.query('registrations').collect()

    const dtos = await Promise.all(registrations.map((r) => buildRegistrationDTO(ctx, r)))
    return dtos.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  },
})

/* ------------------------------------------------------------------ */
/* Query membro: storico prenotazioni del chiamante                    */
/* ------------------------------------------------------------------ */

export const myRegistrations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    const registrations = await ctx.db
      .query('registrations')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect()

    const result = []
    for (const registration of registrations) {
      const event = await ctx.db.get(registration.eventId)
      // Events are never deleted in this schema, so a missing event indicates
      // an orphaned registration (e.g. from development/seed data). Skip silently.
      if (!event) continue

      const persons = await ctx.db
        .query('persons')
        .withIndex('by_registration', (q) => q.eq('registrationId', registration._id))
        .collect()

      const personDTOs = []
      for (const person of persons) {
        const checkIns = await ctx.db
          .query('activityCheckIns')
          .withIndex('by_person', (q) => q.eq('personId', person._id))
          .collect()
        personDTOs.push({
          id: person._id,
          name: person.name,
          category: person.category,
          age: person.age,
          allergies: person.allergies ?? null,
          ticketCode: person.ticketCode,
          eventCheckInAt: person.eventCheckInAt,
          eventCheckInCount: person.eventCheckInCount,
          activityCheckIns: checkIns.map((c) => ({
            activityId: c.activityId,
            slotId: c.slotId,
            at: c.at,
          })),
        })
      }

      result.push({
        id: registration._id,
        eventId: registration.eventId,
        eventTitle: event.title,
        eventLocation: event.location,
        createdAt: new Date(registration._creationTime).toISOString(),
        persons: personDTOs,
      })
    }

    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  },
})

/* ------------------------------------------------------------------ */
/* Annullamento della Prenotazione (admin, ADR 0004)                   */
/* ------------------------------------------------------------------ */

/**
 * Elimina end-to-end una Prenotazione: le sue Persone, le selezioni di
 * slot e i check-in di attività, liberando i posti negli Slot e
 * invalidando i ticketCode (una scansione successiva risulta not-found).
 * Solo admin, per ADR 0004: non esiste annullamento self-service.
 */
export const cancel = mutation({
  args: { registrationId: v.id('registrations') },
  handler: async (ctx, { registrationId }) => {
    await requireAdmin(ctx)
    const registration = await ctx.db.get(registrationId)
    if (!registration) throw new Error('Prenotazione non trovata')

    const persons = await ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect()
    for (const person of persons) {
      const checkIns = await ctx.db
        .query('activityCheckIns')
        .withIndex('by_person', (q) => q.eq('personId', person._id))
        .collect()
      for (const checkIn of checkIns) await ctx.db.delete(checkIn._id)
      await ctx.db.delete(person._id)
    }

    const selections = await ctx.db
      .query('slotSelections')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect()
    for (const selection of selections) await ctx.db.delete(selection._id)

    await ctx.db.delete(registrationId)
    return { success: true }
  },
})
