/**
 * Modello di dominio.
 * Terminologia allineata a CONTEXT.md (Utente, Persona, Evento, Attività, Slot).
 */

import type { DeliverySnapshot } from './email-delivery'

import type { PersonStatus } from './person-status'

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
  /** Posti dello Slot. `null` = nessun tetto (Attività ad accesso libero, ADR 0011). */
  capacity: number | null
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
  /**
   * Attività ad accesso libero (ADR 0011): un solo Slot senza tetto, nessuna
   * fascia da scegliere. Esente da policy di selezione e sovrapposizioni.
   * Con il flag attivo `slotDurationMinutes` e `capacityPerSlot` non
   * significano nulla.
   */
  freeAccess: boolean
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
  /**
   * Raccolta nomi (issue #36). Se true (default), il form chiede il nome di ogni
   * Figlio/Ospite. Se false, sono identificati dall'Etichetta posizionale
   * («Figlio 1», «Ospite 1»); i Figli mantengono l'età.
   */
  collectNames: boolean
  /**
   * Allergie e intolleranze (issue #37). Se true, il form chiede a ogni Persona
   * una dichiarazione facoltativa in testo libero. false (default) = nessun
   * campo nel form e nessuna dichiarazione raccolta.
   */
  collectAllergies: boolean
  /**
   * Registrazione dell'uscita (issue #38). Se true, lo scanner offre la
   * modalità «Uscita» come terzo momento di Check-in. false = comportamento
   * odierno (solo ingresso evento e accesso attività).
   */
  recordExit: boolean
  /**
   * Testo dell'email di conferma (issue #42): oggetto in chiaro e corpo in
   * markdown, scritti dall'admin. Stringa vuota = ripiego sul testo odierno.
   * Solo per operatori: vuoti lato pubblico.
   */
  emailSubject: string
  emailBody: string
  /**
   * Esito della Prenotazione (ADR 0014): titolo, corpo e chiusura della
   * schermata che segue una Prenotazione riuscita. Testo semplice a paragrafi.
   * Stringa vuota = ripiego, campo per campo (la chiusura vuota non rende
   * nulla). Pubblici, a differenza del Testo dell'email di conferma.
   */
  resultTitle: string
  resultBody: string
  resultClosing: string
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
  /**
   * Nome e cognome in due campi (ADR 0017). Il DTO porta la **coppia**: chi
   * mostra un nome composto passa da `fullName` in `lib/person-name.ts`, che è
   * il solo posto che sa in che ordine si scrive.
   */
  firstName: string
  /** Cognome. null per Figli, Ospiti ed Etichette posizionali: non gli è chiesto. */
  lastName: string | null
  category: PersonCategory
  /** Valorizzata solo per la categoria "child". */
  age: number | null
  /**
   * Allergie e intolleranze dichiarate (issue #37). Dato sanitario visibile ad
   * admin, export, email di conferma e scanner. null = nessuna dichiarazione.
   */
  allergies: string | null
  ticketCode: string
  /** Orario del primo check-in all'ingresso dell'Evento. */
  eventCheckInAt: string | null
  /** Numero totale di ingressi all'Evento (0 se mai entrato). */
  eventCheckInCount: number
  /** Orario dell'ultimo ingresso all'Evento. */
  eventCheckInLastAt: string | null
  /** Orario della prima uscita dall'Evento (issue #38). null se mai uscito. */
  eventCheckOutAt: string | null
  /** Numero totale di uscite dall'Evento (0 se mai uscito). */
  eventCheckOutCount: number
  /** Orario dell'ultima uscita dall'Evento. */
  eventCheckOutLastAt: string | null
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
  /**
   * Ultima Consegna dell'email di conferma (ADR 0016). null = nessuna
   * registrata: le Prenotazioni anteriori a quel lavoro non ne hanno, per
   * scelta, e l'assenza non è un allarme.
   */
  emailDelivery: DeliverySnapshot | null
}

/**
 * Rinuncia (ADR 0004): risposta «no» a Conferma di partecipazione. Non è una
 * Prenotazione: nessuna Persona, nessun posto, nessun QR.
 */
export interface Decline {
  id: string
  eventId: string
  /** Nome e cognome, entrambi sempre presenti (ADR 0017). */
  firstName: string
  lastName: string
  email: string
  /** ISO dell'ultima risposta «no» (aggiornata a ogni upsert). */
  respondedAt: string
}

export interface SlotWithAvailability extends Slot {
  /**
   * Persone che occupano lo Slot. Contato anche senza tetto: su un'Attività ad
   * accesso libero è il numero di chi ha risposto «mi interessa», che è
   * esattamente il dato per cui la domanda esiste.
   */
  taken: number
  /** Posti residui. `null` = nessun tetto, quindi nessun residuo da contare. */
  available: number | null
}

export interface ActivityWithAvailability extends Omit<Activity, 'slots'> {
  slots: SlotWithAvailability[]
}

/** Persona associata a uno Slot, con stato del check-in all'Attività/Slot. */
export interface SlotPerson {
  id: string
  firstName: string
  lastName: string | null
  category: PersonCategory
  /** Allergie e intolleranze dichiarate. null = nessuna dichiarazione. */
  allergies: string | null
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
  /**
   * Esito della Prenotazione dentro l'iframe (ADR 0014): la griglia dei
   * biglietti e «Nuova registrazione» si spengono separatamente. true =
   * si vedono (comportamento odierno). Fuori dall'iframe non hanno effetto.
   */
  embedShowTickets: boolean
  embedShowNewRegistration: boolean
  registrationsCount: number
  personsCount: number
  /**
   * Data dell'Evento (ADR 0009): quella dichiarata sull'Evento se c'è,
   * altrimenti quella derivata dalle Attività (primo inizio, ultima fine).
   * `null` = nessuna delle due, cioè «Data da definire».
   */
  startsAt: string | null
  endsAt: string | null
  /**
   * La dichiarazione grezza, che solo il form dell'admin rimette in campo:
   * `null` = l'admin non ha dichiarato nulla e la data si deriva. Da
   * `startsAt`/`endsAt` non si distinguerebbe una data dichiarata da una
   * derivata, e risalvando il form la congelerebbe in dichiarazione.
   */
  declaredStartsAt: string | null
  declaredEndsAt: string | null
  /** Somma dei posti dei soli Slot con tetto (ADR 0011). */
  totalCapacity: number
  /** Somma dei posti occupati su tutti gli Slot, anche quelli senza tetto. */
  totalTaken: number
  /** Posti ancora disponibili sui soli Slot con tetto. */
  totalAvailable: number
  /** true se esistono Slot con tetto e sono tutti pieni. */
  soldOut: boolean
  /**
   * Informativa privacy dell'Evento (ADR 0012). Stringa vuota = nessuna
   * casella nel form e nessun vincolo nelle mutation.
   */
  privacyNotice: string
}

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Persona registrata con il QR (data URL) pronto da mostrare/stampare. */
export interface RegisteredPerson {
  firstName: string
  lastName: string | null
  category: PersonCategory
  age: number | null
  /** Allergie e intolleranze dichiarate. null = nessuna dichiarazione. */
  allergies: string | null
  ticketCode: string
  qrDataUrl: string
}

/** Momento di Check-in scelto dall'operatore. «exit» solo con recordExit attivo. */
export type CheckInMode = 'event' | 'activity' | 'exit'

/**
 * Punto di controllo selezionato nello scanner: i tre momenti che scrivono più
 * «Solo verifica» (issue #39), che legge lo stato consolidato senza registrare
 * nulla e per questo non è un `CheckInMode`. Il letterale è `lookup` come la
 * query e come l'esito: un solo nome in tutto il codice, «Solo verifica» resta
 * l'etichetta mostrata all'operatore.
 */
export type ScannerMode = CheckInMode | 'lookup'

export type CheckInStatus =
  | 'event-valid'
  | 'event-already'
  | 'activity-valid'
  | 'activity-already'
  | 'exit-valid'
  | 'exit-already'
  | 'exit-not-entered'
  | 'exit-disabled'
  | 'not-registered-activity'
  | 'too-early'
  | 'too-late'
  | 'wrong-event'
  | 'not-found'
  /** «Solo verifica» (issue #39): Persona letta, nessuna registrazione. */
  | 'lookup'

export interface CheckInPersonSummary {
  firstName: string
  lastName: string | null
  category: PersonCategory
  age: number | null
  /** Allergie e intolleranze dichiarate, mostrate sulla result card dello scanner. */
  allergies: string | null
  ticketCode: string
}

export interface CheckInResult {
  status: CheckInStatus
  message: string
  person?: CheckInPersonSummary
  /**
   * Stato consolidato della Persona (issue #39): presente ogni volta che la
   * scansione la risolve, a prescindere dall'esito e dal momento scansionato.
   */
  personStatus?: PersonStatus
  eventTitle?: string
  activityTitle?: string
  slotStart?: string
  slotEnd?: string
  at?: string
  /** Numero totale di ingressi registrati per questa Persona nel contesto (mode/attività). */
  count?: number
}
