import { ConvexError } from 'convex/values'
import {
  emailAlreadyUsedHead,
  emailAlreadyUsedMessage,
  isValidEmail,
  normalizeEmail,
  type ResponseKind,
} from '../lib/email'
import { getAuthUserId } from '@convex-dev/auth/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { EmbedTheme } from '../lib/embed'
import { TICKET_HEADER_DEFAULT, type TicketHeader } from '../lib/pdf/ticket-header'

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
/* Una sola risposta per email per Evento (ADR 0005)                   */
/* ------------------------------------------------------------------ */

// Normalizzazione, forma dell'indirizzo e testi della regola vivono in `lib/`
// perché li condividono tutte e due le sponde (ADR 0022, 0023); si ri-esportano
// di qui perché è da `model` che il resto di `convex/` li prende.
export { normalizeEmail, emailAlreadyUsedHead, emailAlreadyUsedMessage }
export type { ResponseKind }

/**
 * Indirizzo di forma accettabile, o `ConvexError`. La regola sta in `lib`, che
 * la condivide con lo zod del pannello admin; qui ci si mette solo l'eccezione,
 * che è di casa in `convex/`.
 */
export function assertValidEmail(email: string): void {
  if (!isValidEmail(email)) throw new ConvexError('Indirizzo email non valido')
}

/**
 * Che risposta ha già l'email (normalizzata) per l'Evento, o `null` se è
 * libera. Sorgente unica del vincolo «Una sola risposta per email» (ADR 0005):
 * la usano il rifiuto server-side (`requireEmailUnusedForEvent`) e l'anticipo
 * che il form ne fa (`registrations.hasResponse`, ADR 0022), così le due
 * superfici non possono divergere nel tempo.
 *
 * Le Prenotazioni memorizzano `contactEmail` così come digitata, quindi il
 * confronto normalizza a lettura e non può usare un indice sull'email — al
 * contrario delle Rinunce, che la memorizzano già normalizzata.
 */
export async function responseKindForEmail(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<'events'>,
  normalizedEmail: string,
): Promise<ResponseKind | null> {
  const registrations = await ctx.db
    .query('registrations')
    .withIndex('by_event', (q) => q.eq('eventId', eventId))
    .collect()
  const alreadyRegistered = registrations.some(
    (r) => normalizeEmail(r.contactEmail) === normalizedEmail,
  )
  if (alreadyRegistered) return 'registration'

  const decline = await ctx.db
    .query('declines')
    .withIndex('by_event_email', (q) => q.eq('eventId', eventId).eq('email', normalizedEmail))
    .unique()
  return decline ? 'decline' : null
}

/**
 * Blocca la scrittura se l'email (normalizzata) ha già una risposta per
 * l'Evento — Prenotazione o Rinuncia. Ogni modifica passa dall'organizzatore
 * (Annullamento della Prenotazione o Rimozione della Rinuncia, solo admin).
 *
 * Qui i due casi restano distinti, perché la testa del messaggio nomina il
 * ramo. È la sola superficie pubblica che lo fa: l'anticipo del form dice che
 * una risposta c'è, non quale (ADR 0022).
 *
 * Prende l'Evento e non il suo id perché la coda del messaggio porta la sua
 * [[E-mail dell'organizzatore]] (ADR 0023) — e chi chiama il documento ce l'ha
 * già in mano, quindi non c'è nessuna lettura in più da pagare.
 */
export async function requireEmailUnusedForEvent(
  ctx: QueryCtx | MutationCtx,
  event: Doc<'events'>,
  normalizedEmail: string,
): Promise<void> {
  const kind = await responseKindForEmail(ctx, event._id, normalizedEmail)
  if (kind) throw new ConvexError(emailAlreadyUsedMessage(kind, event.organizerEmail))
}

/**
 * Tutte le email (normalizzate) che hanno già una risposta per l'Evento, con
 * il tipo di risposta. Serve all'Import delle risposte (ADR 0020), che deve
 * fare lo stesso controllo di `requireEmailUnusedForEvent` per centinaia di
 * righe in una transazione: rileggere le Prenotazioni a ogni riga farebbe
 * n² letture per un dato che non cambia se non per mano dell'import stesso —
 * che infatti aggiorna la mappa a ogni scrittura.
 */
export async function usedEmailsForEvent(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<'events'>,
): Promise<Map<string, ResponseKind>> {
  const used = new Map<string, ResponseKind>()
  const registrations = await ctx.db
    .query('registrations')
    .withIndex('by_event', (q) => q.eq('eventId', eventId))
    .collect()
  for (const r of registrations) used.set(normalizeEmail(r.contactEmail), 'registration')
  const declines = await ctx.db
    .query('declines')
    .withIndex('by_event_email', (q) => q.eq('eventId', eventId))
    .collect()
  for (const d of declines) used.set(d.email, 'decline')
  return used
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
  if (!user) throw new ConvexError('Non autenticato')
  return user
}

export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'>> {
  const user = await requireUser(ctx)
  if (user.role !== 'admin') throw new ConvexError('Accesso riservato agli amministratori')
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
    // Members are never check-in operators.
    if (user.role !== 'staff' && user.role !== undefined) return false
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

/**
 * Richiede che l'utente corrente possa operare sull'Evento (admin o staff
 * associato). Lancia se non autenticato o non autorizzato.
 */
export async function requireCanOperate(
  ctx: QueryCtx | MutationCtx,
  event: Doc<'events'>,
): Promise<Doc<'users'>> {
  const user = await requireUser(ctx)
  if (!(await canOperateEvent(ctx, event))) {
    throw new ConvexError('Non sei autorizzato a gestire questo evento')
  }
  return user
}

/* ------------------------------------------------------------------ */
/* Composizione statistiche Evento (shape compatibile col frontend)    */
/* ------------------------------------------------------------------ */

export interface SlotWithAvailabilityDTO {
  id: string
  activityId: string
  start: string
  end: string
  /** `null` = nessun tetto (Attività ad accesso libero, ADR 0011). */
  capacity: number | null
  taken: number
  /** `null` = nessun tetto, quindi nessun residuo da contare. */
  available: number | null
}

export interface ActivityWithAvailabilityDTO {
  id: string
  eventId: string
  title: string
  start: string
  end: string
  slotDurationMinutes: number
  capacityPerSlot: number
  /** Attività ad accesso libero (ADR 0011): un solo Slot, senza tetto né fasce. */
  freeAccess: boolean
  slots: SlotWithAvailabilityDTO[]
}

export interface EventWithStatsDTO {
  id: string
  title: string
  description: string
  location: string
  /**
   * E-mail dell'organizzatore (ADR 0023). Stringa vuota = nessun recapito.
   * Pubblica: la legge anche il form incorporato.
   */
  organizerEmail: string
  /** URL risolto dell'immagine di copertina, o null se non impostata. */
  imageUrl: string | null
  /** storageId grezzo, esposto solo agli operatori (includeScanToken). */
  imageStorageId: string | null
  createdAt: string
  activities: ActivityWithAvailabilityDTO[]
  activityPolicy: 'all' | 'min' | 'free'
  minActivities: number
  allowOverlap: boolean
  checkInToleranceMinutes: number
  allowQrReuse: boolean
  requireAccount: boolean
  confirmParticipation: boolean
  /** Raccolta nomi (issue #36). true (default) = raccogli i nomi di Figli/Ospiti. */
  collectNames: boolean
  /** Allergie e intolleranze (issue #37). false (default) = nessun campo nel form. */
  collectAllergies: boolean
  /** Nota (ADR 0019): assente sullo schema = false, come le allergie. */
  collectNotes: boolean
  /** Registrazione dell'uscita (issue #38). false (default) = nessuna modalità Uscita. */
  recordExit: boolean
  /**
   * Testo dell'email di conferma (issue #42): oggetto in chiaro e corpo in
   * markdown. Vuoti = ripiego sul testo odierno. Solo operatori
   * (includeScanToken): vuoti lato pubblico.
   */
  emailSubject: string
  emailBody: string
  /** Riepilogo in coda all'email. true (default) = si vede. Solo operatori. */
  emailShowSummary: boolean
  /**
   * Intestazione del Biglietto: 'title' (default) = titolo dell'Evento;
   * 'image' = la sola Immagine dell'Evento al posto del titolo. **Pubblica**,
   * a differenza del Testo dell'email: il PDF lo genera anche la pagina
   * pubblica, dal browser di chi ha appena prenotato.
   */
  ticketHeader: TicketHeader
  /**
   * Esito della Prenotazione (ADR 0014). Vuoti = ripiego sul testo odierno.
   * **Pubblici**, a differenza di `emailSubject`/`emailBody`: è la schermata
   * di conferma del form a doverli leggere, e la legge chiunque prenoti.
   */
  resultTitle: string
  resultBody: string
  resultClosing: string
  allowChildren: boolean
  maxChildrenPerRegistration: number
  allowCompanions: boolean
  maxCompanionsPerRegistration: number
  /** Regola del nucleo familiare (issue #35). null = non attiva. */
  maxCompanionsWithChildren: number | null
  checkInAccess: 'private' | 'password'
  scanToken: string
  hasCheckInPassword: boolean
  /** Incorporamento del form abilitato per questo Evento. */
  embedEnabled: boolean
  /** Origini autorizzate a incorporare. Popolate solo per operatori (includeScanToken). */
  allowedOrigins: string[]
  /**
   * Intestazione del form incorporato. Pubblici, a differenza di
   * `allowedOrigins`: è l'embed stesso a leggerli, e l'embed interroga
   * `getPublic`.
   */
  embedShowTitle: boolean
  embedShowLocation: boolean
  /**
   * Esito della Prenotazione dentro l'iframe (ADR 0014): griglia dei biglietti
   * e «Nuova registrazione», spegnibili separatamente. Pubblici come i due
   * qui sopra.
   */
  embedShowTickets: boolean
  embedShowNewRegistration: boolean
  /**
   * Aspetto dell'Incorporamento (ADR 0013). `null` = aspetto odierno.
   * Pubblico per la stessa ragione dei due booleani qui sopra: è il form
   * incorporato a leggerlo, e non rivela nulla che non sia già visibile.
   */
  embedTheme: EmbedTheme | null
  registrationsCount: number
  personsCount: number
  startsAt: string | null
  endsAt: string | null
  /** Date dichiarate sull'Evento (ADR 0009). null = derivate dalle Attività. */
  declaredStartsAt: string | null
  declaredEndsAt: string | null
  totalCapacity: number
  totalTaken: number
  totalAvailable: number
  soldOut: boolean
  privacyNotice: string
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

/**
 * Le date dell'Evento in lettura (ADR 0009): la dichiarazione dell'admin vince
 * **sempre** sulla derivazione dalle Attività, e inizio e fine si risolvono in
 * modo **indipendente** l'uno dall'altro — un Evento può dichiarare solo
 * l'inizio e lasciare che la fine resti quella dell'ultima Attività.
 *
 * Senza dichiarazione e senza Attività non c'è data: `null`, che ogni
 * superficie rende come «Data da definire», biglietto compreso.
 *
 * Una fine derivata che cadrebbe **prima** dell'inizio dichiarato non viene
 * resa: sarebbe un intervallo alla rovescia («20:00 – 15:00») stampato sul
 * biglietto, e un biglietto che mente sull'orario è peggio di uno che tace.
 * Tace la lettura, non la scrittura: la dichiarazione resta in tabella, e se
 * un domani le Attività si spostano la fine ricompare da sé. Il caso non si
 * può prevenire in scrittura — l'ADR ha scartato apposta il modello che
 * vincola le Attività alla finestra dell'Evento, perché farebbe di ogni
 * cambio d'orario una violazione da spiegare all'admin.
 *
 * È l'unico posto in cui la regola di lettura vive — DTO, header del biglietto
 * PDF, ordinamento degli elenchi passano tutti di qui. La regola di scrittura
 * (la fine dichiarata richiede l'inizio ed è successiva) sta in `events.ts`,
 * dove l'admin può ancora essere avvisato.
 */
export function resolveEventDates(
  event: { startsAt?: string; endsAt?: string },
  activities: Array<{ start: string; end: string }>,
): { startsAt: string | null; endsAt: string | null } {
  const starts = activities.map((a) => new Date(a.start).getTime())
  const ends = activities.map((a) => new Date(a.end).getTime())
  const startsAt =
    event.startsAt ?? (starts.length ? new Date(Math.min(...starts)).toISOString() : null)
  const endsAt = event.endsAt ?? (ends.length ? new Date(Math.max(...ends)).toISOString() : null)

  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return { startsAt, endsAt: null }
  }
  return { startsAt, endsAt }
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
        available: slot.capacity === null ? null : Math.max(0, slot.capacity - taken),
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
      freeAccess: activity.freeAccess ?? false,
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

  const imageUrl = event.imageStorageId
    ? await ctx.storage.getUrl(event.imageStorageId)
    : null

  const allSlots = activityDTOs.flatMap((a) => a.slots)
  // Gli Slot senza tetto restano fuori da capienza e residui (ADR 0011):
  // sommarli darebbe NaN, e contarli come zero direbbe «esaurito» a un Evento
  // che non ha mai avuto un limite. Le presenze invece si contano sempre.
  const cappedSlots = allSlots.filter(
    (s): s is typeof s & { capacity: number; available: number } => s.capacity !== null,
  )
  const totalCapacity = cappedSlots.reduce((sum, s) => sum + s.capacity, 0)
  const totalTaken = allSlots.reduce((sum, s) => sum + s.taken, 0)
  const totalAvailable = cappedSlots.reduce((sum, s) => sum + s.available, 0)

  return {
    id: event._id,
    title: event.title,
    description: event.description,
    location: event.location,
    // Pubblica di proposito (ADR 0023): chi trova la propria e-mail già usata
    // deve poterla leggere anche dentro l'iframe, dove non c'è altra pagina.
    organizerEmail: event.organizerEmail ?? '',
    imageUrl,
    imageStorageId: opts.includeScanToken ? (event.imageStorageId ?? null) : null,
    createdAt: new Date(event._creationTime).toISOString(),
    activities: activityDTOs,
    activityPolicy: event.activityPolicy,
    minActivities: event.minActivities,
    allowOverlap: event.allowOverlap,
    checkInToleranceMinutes: event.checkInToleranceMinutes,
    allowQrReuse: event.allowQrReuse,
    requireAccount: event.requireAccount ?? false,
    confirmParticipation: event.confirmParticipation ?? false,
    collectNames: event.collectNames ?? true,
    collectAllergies: event.collectAllergies ?? false,
    collectNotes: event.collectNotes ?? false,
    recordExit: event.recordExit ?? false,
    // Testo dell'email di conferma (issue #42): configurazione da pannello
    // admin, non esposta al pubblico — come scanToken e allowedOrigins.
    emailSubject: opts.includeScanToken ? (event.emailSubject ?? '') : '',
    emailBody: opts.includeScanToken ? (event.emailBody ?? '') : '',
    // Al pubblico vale il default: non c'è niente da leggere, e niente da
    // rivelare.
    emailShowSummary: opts.includeScanToken ? (event.emailShowSummary ?? true) : true,
    // Assente = titolo: gli Eventi nati prima di questa scelta stampano il
    // biglietto identico a prima.
    ticketHeader: event.ticketHeader ?? TICKET_HEADER_DEFAULT,
    // L'Esito della Prenotazione invece è pubblico: lo rende il form a
    // chiunque prenoti, embed compreso. Il ripiego non è qui ma in
    // `lib/result-content.ts`, perché dipende dal numero di Persone e dallo
    // stato dei biglietti inline — due cose che il DTO non conosce.
    resultTitle: event.resultTitle ?? '',
    resultBody: event.resultBody ?? '',
    resultClosing: event.resultClosing ?? '',
    allowChildren: event.allowChildren,
    maxChildrenPerRegistration: event.maxChildrenPerRegistration,
    allowCompanions: event.allowCompanions,
    maxCompanionsPerRegistration: event.maxCompanionsPerRegistration,
    maxCompanionsWithChildren: event.maxCompanionsWithChildren ?? null,
    checkInAccess: event.checkInAccess,
    scanToken: opts.includeScanToken ? event.scanToken : '',
    hasCheckInPassword: event.checkInPasswordHash !== null,
    embedEnabled: event.embedEnabled ?? false,
    allowedOrigins: opts.includeScanToken ? (event.allowedOrigins ?? []) : [],
    // Assenti = si vedono: gli Eventi creati prima di questa impostazione non
    // devono perdere l'intestazione al deploy.
    embedShowTitle: event.embedShowTitle ?? true,
    embedShowLocation: event.embedShowLocation ?? true,
    embedShowTickets: event.embedShowTickets ?? true,
    embedShowNewRegistration: event.embedShowNewRegistration ?? true,
    embedTheme: event.embedTheme ?? null,
    registrationsCount: registrations.length,
    personsCount: persons.length,
    ...resolveEventDates(event, activities),
    // La dichiarazione grezza, che il form dell'admin rimette in campo: dai
    // valori risolti non si distinguerebbe una data dichiarata da una derivata,
    // e risalvando senza toccare nulla la derivazione si congelerebbe in
    // dichiarazione (ADR 0009). `null` = l'admin non ha dichiarato niente.
    declaredStartsAt: event.startsAt ?? null,
    declaredEndsAt: event.endsAt ?? null,
    totalCapacity,
    totalTaken,
    totalAvailable,
    soldOut: cappedSlots.length > 0 && totalAvailable <= 0,
    privacyNotice: event.privacyNotice ?? '',
  }
}
