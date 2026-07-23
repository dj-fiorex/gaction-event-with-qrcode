/**
 * Stato consolidato di una Persona (issue #39).
 *
 * I tre momenti di Check-in — Ingresso all'Evento, Visita (accesso alle
 * Attività) e Uscita — hanno la stessa forma: prima volta, numero di
 * ripetizioni, ultima volta. Il modello di persistenza però li registra in
 * posti diversi (campi della Persona per ingresso/uscita, righe di
 * `activityCheckIns` per la Visita): questo modulo è il punto unico in cui
 * quelle forme diverse diventano lo stesso `CheckInMoment`, così backend,
 * scanner, pannello admin ed export raccontano la stessa storia.
 */

/** Un momento di Check-in consolidato. `at` null = mai registrato. */
export interface CheckInMoment {
  /** Orario della prima registrazione. null se il momento non è mai avvenuto. */
  at: string | null
  /** Numero di registrazioni (0 se mai avvenuto, > 1 con il riuso QR attivo). */
  count: number
  /** Orario dell'ultima registrazione. null se il momento non è mai avvenuto. */
  lastAt: string | null
}

/** I tre momenti di Check-in di una Persona, sempre tutti e tre presenti. */
export interface PersonStatus {
  entry: CheckInMoment
  activity: CheckInMoment
  exit: CheckInMoment
}

/** Momento mai registrato: la forma che la UI rende con un trattino. */
export const NEVER: CheckInMoment = { at: null, count: 0, lastAt: null }

/**
 * Costruisce un momento da una coppia di orari opzionali e un contatore.
 * Tollera le righe pre-#38, dove i campi d'uscita sono assenti del tutto.
 */
export function momentFrom(
  at: string | null | undefined,
  count: number | null | undefined,
  lastAt: string | null | undefined,
): CheckInMoment {
  if (!at) return NEVER
  return { at, count: count ?? 1, lastAt: lastAt ?? at }
}

/**
 * Campi d'ingresso/uscita di una Persona, sia come documento sia come DTO.
 * Quelli d'uscita sono facoltativi perché nei documenti pre-#38 mancano del
 * tutto, mentre il DTO li normalizza a null/0.
 */
interface PersonMomentFields {
  eventCheckInAt: string | null
  eventCheckInCount: number
  eventCheckInLastAt: string | null
  eventCheckOutAt?: string | null
  eventCheckOutCount?: number | null
  eventCheckOutLastAt?: string | null
}

/**
 * Unico costruttore dello stato consolidato. Lo chiamano sia il backend
 * (documenti Convex, dove i campi d'uscita possono essere assenti) sia il
 * client (DTO, dove sono normalizzati a null/0): il tipo accetta entrambe le
 * forme proprio perché la fusione dei tre momenti resti scritta una volta sola.
 */
export function statusOfPerson(
  person: PersonMomentFields,
  activityCheckIns: { at: string; count: number; lastAt: string }[],
): PersonStatus {
  return {
    entry: momentFrom(person.eventCheckInAt, person.eventCheckInCount, person.eventCheckInLastAt),
    activity: mergeMoments(activityCheckIns.map((c) => momentFrom(c.at, c.count, c.lastAt))),
    exit: momentFrom(person.eventCheckOutAt, person.eventCheckOutCount, person.eventCheckOutLastAt),
  }
}

/**
 * Fonde i check-in di più Attività in un unico momento «Visita»: la prima
 * visita è la più remota, l'ultima la più recente e il contatore somma tutti
 * gli accessi. Una Persona può essere iscritta a più Attività, ma sulla result
 * card dello scanner la domanda dell'operatore è una sola — «ha già fatto il
 * giro?» — e merita una risposta sola.
 *
 * Il contatore è quindi il numero di *accessi alle Attività*, non il numero di
 * ripetizioni della stessa: due Attività visitate una volta ciascuna danno 2,
 * esattamente come una sola Attività visitata due volte. Per l'operatore al
 * varco la domanda è «quante volte è passato», e la risposta è la stessa.
 */
export function mergeMoments(moments: CheckInMoment[]): CheckInMoment {
  const recorded = moments.filter((m) => m.at !== null)
  if (recorded.length === 0) return NEVER
  return {
    at: recorded.reduce((min, m) => (m.at! < min ? m.at! : min), recorded[0].at!),
    count: recorded.reduce((sum, m) => sum + m.count, 0),
    lastAt: recorded.reduce(
      (max, m) => ((m.lastAt ?? m.at!) > max ? (m.lastAt ?? m.at!) : max),
      recorded[0].lastAt ?? recorded[0].at!,
    ),
  }
}
