import { ConvexError, v } from 'convex/values'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import {
  deleteDeliveriesOfRegistration,
  enqueueConfirmationEmail,
  latestDelivery,
  toDeliverySnapshot,
} from './emailDeliveries'
import {
  requireAdmin,
  generateTicketCode,
  getCurrentUser,
  normalizeEmail,
  requireEmailUnusedForEvent,
  usedEmailsForEvent,
  EMAIL_ALREADY_DECLINED_ERROR,
  EMAIL_ALREADY_REGISTERED_ERROR,
} from './model'
import { intervalsOverlap } from '../lib/slots'
import { getAuthUserId } from '@convex-dev/auth/server'

// Allergie e intolleranze (issue #37): dichiarazione facoltativa per Persona.
// Opzionale nei validator così i client che non la raccolgono restano validi.
// Il cognome non compare: il form non lo chiede a Figli e Ospiti (ADR 0017).
const childInput = v.object({
  firstName: v.string(),
  age: v.number(),
  allergies: v.optional(v.string()),
})
const companionInput = v.object({ firstName: v.string(), allergies: v.optional(v.string()) })
const selectionInput = v.object({
  activityId: v.id('activities'),
  slotId: v.id('slots'),
})

/**
 * Lunghezza massima della dichiarazione «Allergie e intolleranze» (issue #37).
 * Deve restare allineata a `allergiesInputSchema` in lib/schemas.ts.
 */
const MAX_ALLERGIES_LENGTH = 300

/**
 * Lunghezza massima della Nota (ADR 0019).
 * Deve restare allineata a `NOTES_MAX` in lib/schemas.ts.
 */
export const MAX_NOTES_LENGTH = 1000

export const NOTES_TOO_LONG_ERROR = `La nota non può superare i ${MAX_NOTES_LENGTH} caratteri`

const REQUIRE_ACCOUNT_LOGIN_ERROR =
  'Per registrarti a questo evento devi accedere con un account Membro verificato'
const REQUIRE_ACCOUNT_ROLE_ERROR =
  'Solo i Membri verificati possono registrarsi a questo evento'
const REQUIRE_ACCOUNT_VERIFICATION_ERROR =
  'Verifica la tua email prima di registrarti a questo evento'
const REQUIRE_ACCOUNT_EMBED_ERROR =
  'Questo evento richiede un account Membro verificato: completa la registrazione dal sito principale'

export const PRIVACY_CONSENT_ERROR =
  'Per proseguire devi accettare l\u2019informativa sul trattamento dei dati personali'

/**
 * Consenso all'informativa (ADR 0012). Il rifiuto vive qui e non nel bottone
 * disabilitato: `register` e `decline` sono mutation pubbliche, chiamabili
 * senza passare dal form, e solo un rifiuto server-side rende vera
 * l'implicazione «la riga esiste ⇒ il consenso c'è».
 *
 * Restituisce il testo da copiare sulla riga: un consenso è consenso a un
 * testo preciso, e `privacyNotice` è riscrivibile dall'admin in ogni momento.
 * `undefined` = l'Evento non ha informativa, quindi non c'è nulla da accettare
 * né da conservare.
 */
export function acceptedPrivacyNotice(
  event: Doc<'events'>,
  accepted: boolean | undefined,
): string | undefined {
  const notice = event.privacyNotice?.trim()
  if (!notice) return undefined
  if (accepted !== true) throw new ConvexError(PRIVACY_CONSENT_ERROR)
  return notice
}

/**
 * Nota (ADR 0019). Condivisa da `register` e `decline`: un solo interruttore
 * d'Evento accende la textarea su tutti e due i rami del form pubblico, quindi
 * una sola funzione ne tiene le regole.
 *
 * Restituisce il testo da scrivere sulla riga, o `undefined` quando non c'è
 * nulla da scrivere — l'Evento non chiede la Nota, oppure la Nota è vuota. Con
 * l'interruttore spento una Nota inviata comunque dal client viene **ignorata**,
 * come i nomi quando la Raccolta nomi è disattiva: `register` e `decline` sono
 * mutation pubbliche, chiamabili senza passare dal form.
 *
 * Il `trim` tocca solo i bordi: gli a-capo interni restano, perché è una
 * textarea e un elenco scritto a mano è esattamente ciò che ci finisce.
 */
export function acceptedNotes(
  event: Doc<'events'>,
  notes: string | undefined,
): string | undefined {
  if (!(event.collectNotes ?? false)) return undefined
  const trimmed = notes?.trim() ?? ''
  if (trimmed.length === 0) return undefined
  if (trimmed.length > MAX_NOTES_LENGTH) throw new ConvexError(NOTES_TOO_LONG_ERROR)
  return trimmed
}

/* ------------------------------------------------------------------ */
/* Regole del nucleo: Figli e Ospiti                                   */
/* ------------------------------------------------------------------ */

/**
 * Figli e Ospiti ammessi, i loro tetti, l'età dei Figli e la Regola del nucleo
 * familiare (issue #35). Una funzione sola per il form pubblico e per
 * l'Import delle risposte (ADR 0020): l'import rispetta i tetti dell'Evento
 * **riga per riga**, e deve rifiutare esattamente ciò che rifiuterebbe il
 * form, non una copia che nel tempo divergerebbe.
 *
 * Riceve Figli e Ospiti **già filtrati** da `allowChildren` e
 * `allowCompanions`, come fa `register`: per il form quel filtro è un
 * silenzio (il client non li ha mostrati), per l'import è un rifiuto.
 */
export function assertHousehold(
  event: Doc<'events'>,
  childrenAges: number[],
  companionsCount: number,
): void {
  if (childrenAges.length > event.maxChildrenPerRegistration) {
    throw new ConvexError(`Puoi aggiungere al massimo ${event.maxChildrenPerRegistration} figli`)
  }

  // Un Figlio è per definizione minorenne (CONTEXT.md): l'intervallo lo
  // impone il server, non il form. Il validator `v.number()` da solo
  // accetterebbe 42, -5 o NaN — e quel valore finirebbe sui biglietti,
  // nell'email di conferma e allo scanner.
  for (const age of childrenAges) {
    if (!Number.isInteger(age) || age < 0 || age > 17) {
      throw new ConvexError('L’età di un figlio deve essere un numero intero tra 0 e 17')
    }
  }

  // Regola del nucleo familiare (issue #35): con almeno un Figlio effettivamente
  // inviato, il cap Ospiti si riduce. Basato sui Figli persistiti, mai su un
  // ramo dichiarato dal client.
  const familyRuleConfigured = event.maxCompanionsWithChildren !== undefined
  const companionsCap =
    familyRuleConfigured && childrenAges.length > 0
      ? event.maxCompanionsWithChildren!
      : event.maxCompanionsPerRegistration
  if (companionsCount > companionsCap) {
    // «Ospite» ha sostituito «Accompagnatore» in tutta la UI e nei documenti
    // (CONTEXT.md / issue #36), a prescindere dalla regola del nucleo familiare.
    throw new ConvexError(`Puoi aggiungere al massimo ${companionsCap} ospiti`)
  }
}

interface PersonInput {
  firstName: string
  lastName: string | null
  /**
   * Il nome l'ha dichiarato chi prenota, o l'ha generato il server? Deciso
   * una volta e scritto sulla riga: rileggere `collectNames` in futuro
   * reinterpreterebbe il passato (ADR 0017).
   */
  nameProvided: boolean
  category: 'user' | 'child' | 'companion'
  age: number | null
  allergies: string | null
}

interface CreatedPerson {
  firstName: string
  lastName: string | null
  category: 'user' | 'child' | 'companion'
  age: number | null
  allergies: string | null
  ticketCode: string
}

/** Scrive le Persone di una Prenotazione, un ticketCode nuovo ciascuna. */
async function insertPersons(
  ctx: MutationCtx,
  registrationId: Id<'registrations'>,
  eventId: Id<'events'>,
  persons: PersonInput[],
): Promise<CreatedPerson[]> {
  const created: CreatedPerson[] = []
  for (const p of persons) {
    const ticketCode = generateTicketCode()
    await ctx.db.insert('persons', {
      registrationId,
      eventId,
      firstName: p.firstName,
      ...(p.lastName ? { lastName: p.lastName } : {}),
      nameProvided: p.nameProvided,
      category: p.category,
      age: p.age,
      ...(p.allergies ? { allergies: p.allergies } : {}),
      ticketCode,
      eventCheckInAt: null,
      eventCheckInCount: 0,
      eventCheckInLastAt: null,
    })
    created.push({
      firstName: p.firstName,
      lastName: p.lastName,
      category: p.category,
      age: p.age,
      allergies: p.allergies,
      ticketCode,
    })
  }
  return created
}

/* ------------------------------------------------------------------ */
/* Registrazione pubblica                                              */
/* ------------------------------------------------------------------ */

export const register = mutation({
  args: {
    eventId: v.id('events'),
    /** Nome e cognome dell'Iscritto in due campi (ADR 0017): il cognome è suo e solo suo. */
    userFirstName: v.string(),
    userLastName: v.string(),
    contactEmail: v.string(),
    /** Allergie e intolleranze dell'Iscritto (issue #37). */
    userAllergies: v.optional(v.string()),
    children: v.array(childInput),
    companions: v.array(companionInput),
    selections: v.array(selectionInput),
    /** Consenso all'informativa (ADR 0012). Richiesto solo se l'Evento ne ha una. */
    privacyAccepted: v.optional(v.boolean()),
    /** Nota lasciata all'organizzatore (ADR 0019). Raccolta solo se l'Evento la chiede. */
    notes: v.optional(v.string()),
    /** true quando la registrazione arriva dal form incorporato su un sito terzo. */
    embed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError('Evento non trovato')

    // Consenso all'informativa (ADR 0012): prima di ogni altra verifica, così
    // nessuna scrittura può precedere il consenso.
    const privacyNoticeAccepted = acceptedPrivacyNotice(event, args.privacyAccepted)

    // Nota (ADR 0019): rifiutata qui se troppo lunga, prima di qualsiasi
    // scrittura — non a metà, con le Persone già create.
    const notes = acceptedNotes(event, args.notes)

    const caller = await getCurrentUser(ctx)

    if (event.requireAccount && args.embed) {
      throw new ConvexError(REQUIRE_ACCOUNT_EMBED_ERROR)
    }

    if (args.embed && !event.embedEnabled) {
      throw new ConvexError('L\u2019incorporamento non è abilitato per questo evento')
    }

    if (event.requireAccount) {
      if (!caller) throw new ConvexError(REQUIRE_ACCOUNT_LOGIN_ERROR)
      if (caller.role !== 'member') throw new ConvexError(REQUIRE_ACCOUNT_ROLE_ERROR)
      if (caller.emailVerificationTime === undefined || !caller.email) {
        throw new ConvexError(REQUIRE_ACCOUNT_VERIFICATION_ERROR)
      }
    }

    const registrationUserId = caller?._id
    const persistedContactEmail =
      caller?.role === 'member' && caller.email
        ? caller.email.trim().toLowerCase()
        : args.contactEmail

    // Una sola risposta per email per Evento (ADR 0005): un'email che ha già
    // una Prenotazione o una Rinuncia non può prenotare di nuovo dal form
    // pubblico; ogni modifica passa dall'organizzatore.
    await requireEmailUnusedForEvent(ctx, event._id, normalizeEmail(persistedContactEmail))

    const children = event.allowChildren ? args.children : []
    const companions = event.allowCompanions ? args.companions : []
    assertHousehold(
      event,
      children.map((c) => c.age),
      companions.length,
    )

    // Carica gli slot selezionati e verifica che appartengano all'Evento.
    const selectedSlots = new Map<Id<'slots'>, Doc<'slots'>>()
    const activityIds = new Set<string>()
    for (const sel of args.selections) {
      if (activityIds.has(sel.activityId)) {
        throw new ConvexError('Puoi selezionare un solo slot per attività')
      }
      activityIds.add(sel.activityId)
      const slot = await ctx.db.get(sel.slotId)
      if (!slot || slot.eventId !== event._id || slot.activityId !== sel.activityId) {
        throw new ConvexError('Selezione attività non valida')
      }
      selectedSlots.set(sel.slotId, slot)
    }

    const activities = await ctx.db
      .query('activities')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()

    // Attività ad accesso libero (ADR 0011): fuori dalla policy e fuori dalle
    // sovrapposizioni. Una visita libera non occupa il tuo tempo, lo attraversa.
    const freeAccessIds = new Set<string>(
      activities.filter((a) => a.freeAccess).map((a) => a._id),
    )
    const scheduled = activities.filter((a) => !a.freeAccess)
    const scheduledSelections = args.selections.filter((s) => !freeAccessIds.has(s.activityId))
    const scheduledActivityIds = new Set(
      [...activityIds].filter((id) => !freeAccessIds.has(id)),
    )

    // Policy di selezione. Senza Attività a fasce la policy non ha referente
    // (ADR 0010): nessuna delle tre regole si applica, e in particolare «almeno
    // un'attività» non può essere chiesto a chi non ne ha nessuna fra cui
    // scegliere — né a chi ha solo visite ad accesso libero.
    if (scheduled.length > 0) {
      if (event.activityPolicy === 'all' && scheduledActivityIds.size !== scheduled.length) {
        throw new ConvexError('Devi selezionare uno slot per ogni attività')
      }
      if (event.activityPolicy === 'min' && scheduledSelections.length < event.minActivities) {
        throw new ConvexError(`Devi selezionare almeno ${event.minActivities} attività`)
      }
      if (event.activityPolicy === 'free' && scheduledSelections.length === 0) {
        throw new ConvexError('Seleziona almeno un\u2019attività')
      }
    }

    // Sovrapposizioni.
    if (!event.allowOverlap) {
      const chosen = Array.from(selectedSlots.values()).filter(
        (slot) => !freeAccessIds.has(slot.activityId),
      )
      for (let i = 0; i < chosen.length; i++) {
        for (let j = i + 1; j < chosen.length; j++) {
          if (intervalsOverlap(chosen[i].start, chosen[i].end, chosen[j].start, chosen[j].end)) {
            throw new ConvexError('Hai selezionato slot che si sovrappongono nel tempo')
          }
        }
      }
    }

    const personsCount = 1 + children.length + companions.length

    // Verifica di capacità atomica. Uno Slot senza tetto viene saltato, non
    // confrontato con zero (ADR 0011): non c'è nulla da esaurire.
    for (const [slotId, slot] of selectedSlots) {
      if (slot.capacity === null) continue
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
        throw new ConvexError(
          `Posti insufficienti per "${activity?.title ?? 'attività'}": restano ${available} posti nello slot scelto`,
        )
      }
    }

    // Persiste registrazione, persone e selezioni.
    const registrationId = await ctx.db.insert('registrations', {
      eventId: event._id,
      contactEmail: persistedContactEmail,
      ...(registrationUserId ? { userId: registrationUserId } : {}),
      // Il testo accettato viaggia con la riga (ADR 0012): l'admin può
      // riscrivere l'informativa dell'Evento senza toccare questo consenso.
      ...(privacyNoticeAccepted ? { privacyNoticeAccepted } : {}),
      // Nota (ADR 0019): assente quando l'Evento non la chiede o è vuota.
      ...(notes ? { notes } : {}),
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
        throw new ConvexError(
          `La dichiarazione di allergie e intolleranze non può superare i ${MAX_ALLERGIES_LENGTH} caratteri`,
        )
      }
      return trimmed
    }

    // Il cognome è **solo dell'Iscritto** (ADR 0017): a Figli e Ospiti il form
    // non lo chiede, quindi la loro riga non ne ha uno da conservare. Vuoto
    // (o di soli spazi) = assente, così `lastName` presente significa sempre
    // qualcosa e nessuna superficie deve difendersi da uno spazio appeso.
    const userLastName = args.userLastName.trim()

    const personsInput: PersonInput[] = [
      {
        firstName: args.userFirstName.trim(),
        lastName: userLastName.length > 0 ? userLastName : null,
        nameProvided: true,
        category: 'user',
        age: null,
        allergies: normalizeAllergies(args.userAllergies),
      },
      ...children.map((c, i) => ({
        firstName: collectNames ? c.firstName.trim() : `Figlio ${i + 1}`,
        lastName: null,
        nameProvided: collectNames,
        category: 'child' as const,
        age: c.age,
        allergies: normalizeAllergies(c.allergies),
      })),
      ...companions.map((c, i) => ({
        firstName: collectNames ? c.firstName.trim() : `Ospite ${i + 1}`,
        lastName: null,
        nameProvided: collectNames,
        category: 'companion' as const,
        age: null,
        allergies: normalizeAllergies(c.allergies),
      })),
    ]

    const createdPersons = await insertPersons(ctx, registrationId, event._id, personsInput)

    for (const sel of args.selections) {
      await ctx.db.insert('slotSelections', {
        registrationId,
        eventId: event._id,
        activityId: sel.activityId,
        slotId: sel.slotId,
      })
    }

    // Consegna dell'email di conferma (ADR 0015, 0016). La riga «in corso» e
    // la pianificazione dell'invio stanno **in questa transazione**: o commitano
    // con la Prenotazione, o non commita nessuno dei tre. «L'email non è mai
    // partita perché il client non è tornato» — scheda chiusa, rete caduta,
    // iframe smontato dalla pagina ospite — smette così di essere una categoria
    // di guasto: se la Prenotazione esiste, l'action girerà.
    await enqueueConfirmationEmail(ctx, {
      registrationId,
      recipient: persistedContactEmail,
    })

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
      // La coppia viaggia intera fino alla superficie (ADR 0017): comporre qui
      // rimetterebbe in giro una stringa da cui il cognome non si estrae più,
      // e l'export ha due colonne da riempire.
      firstName: person.firstName,
      lastName: person.lastName ?? null,
      category: person.category,
      age: person.age,
      allergies: person.allergies ?? null,
      ticketCode: person.ticketCode,
      eventCheckInAt: person.eventCheckInAt,
      eventCheckInCount: person.eventCheckInCount,
      eventCheckInLastAt: person.eventCheckInLastAt,
      // Uscita (issue #38): normalizzata a null/0 per l'admin, così lo stato
      // consolidato (issue #39) ha la stessa forma dell'ingresso e le righe
      // pre-#38 non richiedono un caso speciale nella UI.
      eventCheckOutAt: person.eventCheckOutAt ?? null,
      eventCheckOutCount: person.eventCheckOutCount ?? 0,
      eventCheckOutLastAt: person.eventCheckOutLastAt ?? null,
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
    // Nota (ADR 0019): `buildRegistrationDTO` alimenta solo `listAll`, che è
    // dietro requireAdmin. La Nota non ha nessun'altra uscita: non entra nei
    // DTO del Membro, dello scanner né dell'email.
    notes: registration.notes ?? null,
    selections: selections.map((s) => ({ activityId: s.activityId, slotId: s.slotId })),
    persons: personDTOs,
    // Ultima Consegna dell'email di conferma (ADR 0016): l'admin ne ricava
    // l'icona accanto al Contatto e il conteggio sopra la tabella. Una lettura
    // in più per riga, e non è una classe di problema nuova — questa query fa
    // già `.collect()` sull'intera tabella e legge Persone e selezioni per
    // Prenotazione. null = nessuna Consegna registrata (le Prenotazioni
    // anteriori a questo lavoro non ne hanno: nessun backfill).
    emailDelivery: toDeliverySnapshot(await latestDelivery(ctx, registration._id)),
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
          firstName: person.firstName,
          lastName: person.lastName ?? null,
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
/* Reinvio dell'email dei biglietti (admin, issue #40)                 */
/* ------------------------------------------------------------------ */

/** Controllo minimo di forma: la consegna vera resta responsabilità del provider. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function assertValidEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) throw new ConvexError('Indirizzo email non valido')
}

/**
 * Reinvio dell'email di conferma di una Prenotazione: apre una nuova Consegna,
 * persiste l'eventuale correzione del destinatario e pianifica l'invio.
 *
 * Non prepara più un payload per il browser. Da quando il PDF si renderizza
 * server-side (ADR 0015) il reinvio è la stessa manovra del primo invio — riga
 * «in corso» più pianificazione, nella stessa transazione — e il testo, le
 * etichette, le età e le allergie sono comunque quelli **attuali**, perché
 * l'action rilegge la Prenotazione. I `ticketCode` non cambiano: i
 * biglietti già in mano all'Utente continuano a valere.
 *
 * Il destinatario di sostituzione è facoltativo: omesso, si riusa l'email
 * memorizzata. Se invece è diverso da quella memorizzata viene scritto sulla
 * Prenotazione (user story 28): la correzione vale per ogni comunicazione
 * futura, non solo per questo invio.
 */
export const resendTickets = mutation({
  args: {
    registrationId: v.id('registrations'),
    contactEmail: v.optional(v.string()),
  },
  returns: v.object({ contactEmail: v.string() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const registration = await ctx.db.get(args.registrationId)
    if (!registration) throw new ConvexError('Prenotazione non trovata')

    // Solo un destinatario di sostituzione viene validato: quello memorizzato
    // esiste già ed è la destinazione di default, non un dato in ingresso.
    let contactEmail = registration.contactEmail
    if (args.contactEmail !== undefined) {
      contactEmail = args.contactEmail.trim()
      assertValidEmail(contactEmail)
      if (contactEmail !== registration.contactEmail) {
        await ctx.db.patch(registration._id, { contactEmail })
      }
    }

    // Una Consegna per tentativo (ADR 0016): il Reinvio ne apre un'altra
    // invece di sovrascrivere la precedente. È il punto su cui la tabella si
    // ripaga — avendo potuto cambiare qui il destinatario, un campo solo non
    // saprebbe più dire a quale indirizzo erano andate le email di prima.
    await enqueueConfirmationEmail(ctx, {
      registrationId: registration._id,
      recipient: contactEmail,
    })

    return { contactEmail }
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
    if (!registration) throw new ConvexError('Prenotazione non trovata')

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

    // Anche le Consegne dell'email di conferma (ADR 0016). Qui la regola «si
    // cancella l'impegno, non il fatto» dell'ADR 0008 non si applica: questa è
    // già una cancellazione dura che porta via i Check-in, e la riga contiene
    // un indirizzo email — un dato personale non deve sopravvivere alla riga
    // che lo giustificava.
    await deleteDeliveriesOfRegistration(ctx, registrationId)

    await ctx.db.delete(registrationId)
    return { success: true }
  },
})

/* ------------------------------------------------------------------ */
/* Import delle risposte (admin, ADR 0020)                             */
/* ------------------------------------------------------------------ */

/**
 * Il consenso di una riga importata. Non è l'informativa dell'Evento: chi ha
 * risposto al modulo esterno ha accettato i termini di *quel* modulo, e la
 * riga non deve fingere un consenso a parole mai lette. È anche l'unica
 * traccia dell'origine: non esiste un campo «importata» (ADR 0020).
 */
export const IMPORTED_CONSENT_NOTICE = 'Consenso raccolto tramite modulo esterno'

const importedResponseInput = v.object({
  /** Numero di riga nel foglio, per il rapporto. */
  row: v.number(),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  /** true = Prenotazione, false = Rinuncia. */
  participates: v.boolean(),
  /** Un Figlio per ogni età; il nome è l'Etichetta posizionale. */
  childrenAges: v.array(v.number()),
  companionsCount: v.number(),
  notes: v.union(v.string(), v.null()),
})

const skippedRow = v.object({ row: v.number(), name: v.string(), reason: v.string() })

/**
 * Trasforma le righe di un File di risposte in Prenotazioni e Rinunce.
 *
 * **Riga per riga, mai tutto o niente, mai sovrascrivere.** Ogni riga passa
 * dalle stesse regole del form pubblico — Una sola risposta per email (ADR
 * 0005), Figli e Ospiti ammessi e i loro tetti, età dei Figli, Regola del
 * nucleo familiare — e la riga che le viola si **salta e si riporta**, le
 * altre entrano. Le verifiche precedono ogni scrittura della riga, così una
 * riga saltata non lascia mezza Prenotazione. L'import è quindi ripetibile:
 * lo stesso file caricato due volte aggiunge solo ciò che manca.
 *
 * **Non manda email.** La Prenotazione importata nasce senza Consegna, e
 * proprio quell'assenza è ciò che `sendPendingConfirmations` cerca.
 *
 * Le Attività ad accesso libero entrano tutte, quelle a Slot nessuna: una
 * fascia non si sceglie per conto d'altri, una visita libera sì.
 */
export const importResponses = mutation({
  args: {
    eventId: v.id('events'),
    responses: v.array(importedResponseInput),
  },
  returns: v.object({
    imported: v.number(),
    declined: v.number(),
    skipped: v.array(skippedRow),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError('Evento non trovato')

    // Una lettura sola per l'intera transazione, aggiornata a ogni scrittura:
    // le righe del file si vedono fra loro come vedono ciò che c'era prima.
    const used = await usedEmailsForEvent(ctx, event._id)

    const activities = await ctx.db
      .query('activities')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()
    const freeAccessSelections: Array<{ activityId: Id<'activities'>; slotId: Id<'slots'> }> = []
    for (const activity of activities) {
      if (!activity.freeAccess) continue
      // Un'Attività ad accesso libero ha un solo Slot, largo quanto sé stessa
      // (ADR 0011).
      const slot = await ctx.db
        .query('slots')
        .withIndex('by_activity', (q) => q.eq('activityId', activity._id))
        .first()
      if (slot) freeAccessSelections.push({ activityId: activity._id, slotId: slot._id })
    }

    let imported = 0
    let declined = 0
    const skipped: Array<{ row: number; name: string; reason: string }> = []

    for (const response of args.responses) {
      const firstName = response.firstName.trim()
      const lastName = response.lastName.trim()
      const name = `${firstName} ${lastName}`.trim()
      try {
        // --- Verifiche: nessuna scrittura prima di qui. ---
        if (firstName === '' || lastName === '') throw new ConvexError('Nome o cognome mancante')
        const contactEmail = response.email.trim()
        assertValidEmail(contactEmail)
        const normalizedEmail = normalizeEmail(contactEmail)
        const already = used.get(normalizedEmail)
        if (already === 'registration') throw new ConvexError(EMAIL_ALREADY_REGISTERED_ERROR)
        if (already === 'decline') throw new ConvexError(EMAIL_ALREADY_DECLINED_ERROR)

        // La Nota entra anche con `collectNotes` spento: l'interruttore governa
        // il form, non un dato che esiste già. Il tetto invece vale.
        const notes = response.notes?.trim() ?? ''
        if (notes.length > MAX_NOTES_LENGTH) throw new ConvexError(NOTES_TOO_LONG_ERROR)

        if (!response.participates) {
          // --- Rinuncia ---
          await ctx.db.insert('declines', {
            eventId: event._id,
            firstName,
            lastName,
            email: normalizedEmail,
            respondedAt: new Date().toISOString(),
            privacyNoticeAccepted: IMPORTED_CONSENT_NOTICE,
            ...(notes ? { notes } : {}),
          })
          used.set(normalizedEmail, 'decline')
          declined++
          continue
        }

        // Per il form «non ammessi» è un silenzio (i campi non ci sono); per
        // l'import è un rifiuto, perché la riga li porta comunque.
        if (!event.allowChildren && response.childrenAges.length > 0) {
          throw new ConvexError('L’evento non ammette figli')
        }
        if (!event.allowCompanions && response.companionsCount > 0) {
          throw new ConvexError('L’evento non ammette ospiti')
        }
        if (!Number.isInteger(response.companionsCount) || response.companionsCount < 0) {
          throw new ConvexError('Numero di ospiti non valido')
        }
        assertHousehold(event, response.childrenAges, response.companionsCount)

        // --- Prenotazione ---
        const registrationId = await ctx.db.insert('registrations', {
          eventId: event._id,
          contactEmail,
          privacyNoticeAccepted: IMPORTED_CONSENT_NOTICE,
          ...(notes ? { notes } : {}),
        })
        await insertPersons(ctx, registrationId, event._id, [
          {
            firstName,
            lastName,
            nameProvided: true,
            category: 'user',
            age: null,
            allergies: null,
          },
          ...response.childrenAges.map((age, i) => ({
            firstName: `Figlio ${i + 1}`,
            lastName: null,
            nameProvided: false,
            category: 'child' as const,
            age,
            allergies: null,
          })),
          ...Array.from({ length: response.companionsCount }, (_, i) => ({
            firstName: `Ospite ${i + 1}`,
            lastName: null,
            nameProvided: false,
            category: 'companion' as const,
            age: null,
            allergies: null,
          })),
        ])
        for (const sel of freeAccessSelections) {
          await ctx.db.insert('slotSelections', {
            registrationId,
            eventId: event._id,
            activityId: sel.activityId,
            slotId: sel.slotId,
          })
        }
        used.set(normalizedEmail, 'registration')
        imported++
      } catch (error) {
        // Solo i rifiuti *nostri* diventano righe saltate: un errore
        // inatteso deve far fallire l'intera transazione, non sparire in un
        // rapporto.
        if (!(error instanceof ConvexError)) throw error
        skipped.push({ row: response.row, name, reason: String(error.data) })
      }
    }

    return { imported, declined, skipped }
  },
})

/* ------------------------------------------------------------------ */
/* Invio massivo dell'email di conferma (admin, ADR 0020)              */
/* ------------------------------------------------------------------ */

/**
 * Distanza fra un invio e il successivo. Resend accetta poche richieste al
 * secondo: cento action pianificate nello stesso istante finirebbero in gran
 * parte rifiutate per limite di frequenza, e un rifiuto qui si rimedia solo
 * a mano, riga per riga (ADR 0015).
 */
export const SEND_STAGGER_MS = 600

/**
 * Manda l'email di conferma a tutte le Prenotazioni dell'Evento **senza
 * alcuna Consegna**: per costruzione (ADR 0015) sono quelle importate e mai
 * spedite. Un secondo clic non trova nessuno — chi ha una Consegna, riuscita
 * o fallita, esce dal giro, e il rimedio per i fallimenti resta il Reinvio.
 * Non esiste un «rimanda a tutti», e non per dimenticanza.
 */
export const sendPendingConfirmations = mutation({
  args: { eventId: v.id('events') },
  returns: v.object({ sent: v.number() }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx)
    const event = await ctx.db.get(args.eventId)
    if (!event) throw new ConvexError('Evento non trovato')

    const registrations = await ctx.db
      .query('registrations')
      .withIndex('by_event', (q) => q.eq('eventId', event._id))
      .collect()

    let sent = 0
    for (const registration of registrations) {
      if (await latestDelivery(ctx, registration._id)) continue
      await enqueueConfirmationEmail(ctx, {
        registrationId: registration._id,
        recipient: registration.contactEmail,
        delayMs: sent * SEND_STAGGER_MS,
      })
      sent++
    }
    return { sent }
  },
})
