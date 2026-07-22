/**
 * Modello di dominio.
 * Terminologia allineata a CONTEXT.md (Utente, Persona, Evento, Attività, Slot).
 */

/** Policy con cui una Prenotazione viene associata alle Attività dell'Evento. */
export type ActivityPolicy = 'all' | 'min' | 'free'

/**
 * Modalità di accesso all'interfaccia di scansione di un Evento.
 * - "private": accessibile solo con una sessione admin/staff valida.
 * - "password": il link è pubblico, l'accesso richiede la password dell'Evento.
 */
export type CheckInAccess = 'private' | 'password'

/** Categoria di una Persona. L'Utente iscritto è sempre una Persona di categoria "user". */
export type PersonCategory = 'user' | 'child' | 'companion'

/** Ruolo di un account operatore autenticato via Convex Auth. */
export type Role = 'admin' | 'staff' | 'member'

/** Fascia oraria prenotabile dentro un'Attività, generata dalla Durata. */
export interface Slot {
  id: string
  activityId: string
  start: string
  end: string
  capacity: number
}

/** Segmento di un Evento con finestra oraria e Slot generati dalla Durata. */
export interface Activity {
  id: string
  eventId: string
  title: string
  start: string
  end: string
  slotDurationMinutes: number
  capacityPerSlot: number
  slots: Slot[]
}

export interface Event {
  id: string
  title: string
  description: string
  location: string
  /** URL dell'immagine di copertina risolto dal backend, null se assente. */
  imageUrl: string | null
  /** storageId dell'immagine (solo operatori; null lato pubblico). */
  imageStorageId: string | null
  createdAt: string
  activityPolicy: ActivityPolicy
  /** Numero minimo di Attività da selezionare quando activityPolicy = "min". */
  minActivities: number
  /** Se false, la Prenotazione non può selezionare Slot che si sovrappongono. */
  allowOverlap: boolean
  /** Margine in minuti entro cui è consentito il check-in di uno Slot. */
  checkInToleranceMinutes: number
  /**
   * Se true, lo stesso QR può essere scansionato più volte (ingresso evento e
   * attività) senza essere bloccato: ogni scansione ripetuta resta valida e
   * incrementa il contatore degli ingressi.
   */
  allowQrReuse: boolean
  /** Se true, la Prenotazione è riservata ai Membri autenticati e verificati. */
  requireAccount: boolean
  /** Se true, il form pubblico chiede prima «Confermi la partecipazione? sì/no». */
  confirmParticipation: boolean
  allowChildren: boolean
  maxChildrenPerRegistration: number
  allowCompanions: boolean
  maxCompanionsPerRegistration: number
  /**
   * Regola del nucleo familiare: se impostato, con almeno un Figlio nella
   * Prenotazione il cap Ospiti si riduce a questo valore invece del massimo
   * pieno. null = regola non attiva (comportamento odierno, cap indipendenti).
   */
  maxCompanionsWithChildren: number | null
  /** Modalità di accesso al check-in: privata (sessione) o password. */
  checkInAccess: CheckInAccess
  /** Token univoco e non indovinabile usato nel link /scan/[token]. Rotabile. */
  scanToken: string
  /**
   * Hash della password di check-in (solo per checkInAccess = "password").
   * null se non impostata. La password in chiaro non viene mai persistita.
   */
  checkInPasswordHash: string | null
  activities: Activity[]
}

/** Check-in di una Persona all'ingresso di una specifica Attività/Slot. */
export interface ActivityCheckIn {
  activityId: string
  slotId: string
  /** Orario del primo check-in su questa Attività/Slot. */
  at: string
  /** Numero totale di scansioni valide (>= 1). Rilevante quando allowQrReuse è attivo. */
  count: number
  /** Orario dell'ultima scansione valida. */
  lastAt: string
}

/** Partecipante fisico. Occupa un posto in ogni Slot selezionato e ha 1 QR. */
export interface Person {
  id: string
  name: string
  category: PersonCategory
  /** Valorizzata solo per la categoria "child". */
  age: number | null
  ticketCode: string
  /** Orario del primo check-in all'ingresso dell'Evento. */
  eventCheckInAt: string | null
  /** Numero totale di ingressi all'Evento (0 se mai entrato). */
  eventCheckInCount: number
  /** Orario dell'ultimo ingresso all'Evento. */
  eventCheckInLastAt: string | null
  activityCheckIns: ActivityCheckIn[]
}

/** Uno Slot scelto per una specifica Attività (selezione unica per Prenotazione). */
export interface SlotSelection {
  activityId: string
  slotId: string
}

/** Insieme di Persone iscritte insieme da un Utente in un'unica operazione. */
export interface Registration {
  id: string
  eventId: string
  contactEmail: string
  selections: SlotSelection[]
  persons: Person[]
  createdAt: string
}

/**
 * Rinuncia (ADR 0004): risposta «no» a Conferma di partecipazione. Non è una
 * Prenotazione: nessuna Persona, nessun posto, nessun QR.
 */
export interface Decline {
  id: string
  eventId: string
  name: string
  email: string
  /** ISO dell'ultima risposta «no» (aggiornata a ogni upsert). */
  respondedAt: string
}

export interface SlotWithAvailability extends Slot {
  taken: number
  available: number
}

export interface ActivityWithAvailability extends Omit<Activity, 'slots'> {
  slots: SlotWithAvailability[]
}

/** Persona associata a uno Slot, con stato del check-in all'Attività/Slot. */
export interface SlotPerson {
  id: string
  name: string
  category: PersonCategory
  ticketCode: string
  /** true se la Persona ha effettuato il check-in su questo specifico Slot. */
  checkedIn: boolean
  checkedInAt: string | null
  /** Numero di check-in effettuati su questo Slot (>= 1 se checkedIn). */
  checkInCount: number
}

export interface SlotWithPeople extends SlotWithAvailability {
  persons: SlotPerson[]
  /** Numero di Persone che hanno fatto il check-in e sono dentro questo Slot. */
  checkedInCount: number
}

export interface ActivityWithPeople extends Omit<ActivityWithAvailability, 'slots'> {
  slots: SlotWithPeople[]
}

export interface EventWithStats extends Omit<Event, 'activities' | 'checkInPasswordHash'> {
  activities: ActivityWithAvailability[]
  /** true se è impostata una password di check-in (l'hash non viene esposto). */
  hasCheckInPassword: boolean
  /** true se l'incorporamento del form su siti terzi è abilitato. */
  embedEnabled: boolean
  /** Origini autorizzate a incorporare (solo per operatori; vuoto lato pubblico). */
  allowedOrigins: string[]
  registrationsCount: number
  personsCount: number
  /** Inizio della prima Attività, se presente. */
  startsAt: string | null
  /** Fine dell'ultima Attività, se presente. */
  endsAt: string | null
  /** Somma dei posti di tutti gli Slot dell'Evento. */
  totalCapacity: number
  /** Somma dei posti occupati su tutti gli Slot. */
  totalTaken: number
  /** Posti ancora disponibili complessivi (somma sugli Slot). */
  totalAvailable: number
  /** true se esistono Slot e sono tutti pieni. */
  soldOut: boolean
}

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Persona registrata con il QR (data URL) pronto da mostrare/stampare. */
export interface RegisteredPerson {
  name: string
  category: PersonCategory
  age: number | null
  ticketCode: string
  qrDataUrl: string
}

export type CheckInMode = 'event' | 'activity'

export type CheckInStatus =
  | 'event-valid'
  | 'event-already'
  | 'activity-valid'
  | 'activity-already'
  | 'not-registered-activity'
  | 'too-early'
  | 'too-late'
  | 'wrong-event'
  | 'not-found'

export interface CheckInPersonSummary {
  name: string
  category: PersonCategory
  age: number | null
  ticketCode: string
}

export interface CheckInResult {
  status: CheckInStatus
  message: string
  person?: CheckInPersonSummary
  eventTitle?: string
  activityTitle?: string
  slotStart?: string
  slotEnd?: string
  at?: string
  /** Numero totale di ingressi registrati per questa Persona nel contesto (mode/attività). */
  count?: number
}
