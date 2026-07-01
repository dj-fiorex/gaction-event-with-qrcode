/**
 * Modello di dominio.
 * Terminologia allineata a CONTEXT.md (Utente, Persona, Evento, Attività, Slot).
 */

/** Policy con cui una Prenotazione viene associata alle Attività dell'Evento. */
export type ActivityPolicy = 'all' | 'min' | 'free'

/** Categoria di una Persona. L'Utente iscritto è sempre una Persona di categoria "user". */
export type PersonCategory = 'user' | 'child' | 'companion'

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
  imageUrl: string
  createdAt: string
  activityPolicy: ActivityPolicy
  /** Numero minimo di Attività da selezionare quando activityPolicy = "min". */
  minActivities: number
  /** Se false, la Prenotazione non può selezionare Slot che si sovrappongono. */
  allowOverlap: boolean
  /** Margine in minuti entro cui è consentito il check-in di uno Slot. */
  checkInToleranceMinutes: number
  allowChildren: boolean
  maxChildrenPerRegistration: number
  allowCompanions: boolean
  maxCompanionsPerRegistration: number
  activities: Activity[]
}

/** Check-in di una Persona all'ingresso di una specifica Attività/Slot. */
export interface ActivityCheckIn {
  activityId: string
  slotId: string
  at: string
}

/** Partecipante fisico. Occupa un posto in ogni Slot selezionato e ha 1 QR. */
export interface Person {
  id: string
  name: string
  category: PersonCategory
  /** Valorizzata solo per la categoria "child". */
  age: number | null
  ticketCode: string
  /** Check-in all'ingresso dell'Evento. */
  eventCheckInAt: string | null
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

export interface SlotWithAvailability extends Slot {
  taken: number
  available: number
}

export interface ActivityWithAvailability extends Omit<Activity, 'slots'> {
  slots: SlotWithAvailability[]
}

export interface EventWithStats extends Omit<Event, 'activities'> {
  activities: ActivityWithAvailability[]
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
}
