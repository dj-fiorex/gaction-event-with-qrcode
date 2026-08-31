export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    dateStyle: 'long',
    timeStyle: 'short',
  })
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** Converte un istante ISO nel formato accettato da <input type="datetime-local"> (ora locale). */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Fuso in cui leggere un istante quando chi formatta non è il browser.
 *
 * Questi formatter nascono nel browser, dove «ora locale» è quella di chi
 * legge ed è la risposta giusta. Da quando il PDF dei biglietti si renderizza
 * anche server-side (ADR 0015) lo stesso documento si compone in un runtime che
 * sta su UTC: senza dichiarare il fuso, il biglietto spedito porterebbe un
 * orario spostato rispetto a quello scaricato dalla stessa pagina.
 *
 * Il fuso è quello dell'Evento, non quello di chi guarda: un orario d'ingresso
 * è un fatto del posto in cui si entra.
 */
export const EVENT_TIME_ZONE = 'Europe/Rome'

/** Assente = ora locale di chi legge, cioè il comportamento del browser. */
interface TimeZoneOption {
  timeZone?: string
}

/** Solo l'orario (HH:mm) di un istante ISO. */
export function formatTime(iso: string, { timeZone }: TimeZoneOption = {}): string {
  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
}

/** Intervallo orario compatto, es. "10:00 – 10:30". */
export function formatTimeRange(
  startIso: string,
  endIso: string,
  options: TimeZoneOption = {},
): string {
  return `${formatTime(startIso, options)} \u2013 ${formatTime(endIso, options)}`
}

/** Data + intervallo orario, es. "20 luglio 2026, 10:00 – 13:00". */
export function formatDateRange(
  startIso: string | null,
  endIso: string | null,
  options: TimeZoneOption = {},
): string {
  if (!startIso) return 'Data da definire'
  const day = new Date(startIso).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  })
  if (!endIso) return `${day}, ${formatTime(startIso, options)}`
  return `${day}, ${formatTimeRange(startIso, endIso, options)}`
}

/**
 * Inverso di `toDatetimeLocalValue`: dall'ora locale digitata in un
 * `<input type="datetime-local">` all'istante ISO da persistere.
 *
 * Un valore `datetime-local` non porta con sé il fuso, e l'unico che conosce
 * quello di chi sta scrivendo è il browser: la conversione va fatta qui, non
 * sul server, che leggendo la stessa stringa la interpreterebbe come UTC e
 * sposterebbe gli orari di un offset a ogni salvataggio (ADR 0008: gli Slot
 * si riconoscono per finestra oraria, e una finestra spostata è una finestra
 * nuova). Un valore non interpretabile torna com'è: a rifiutarlo è la
 * validazione, non un formatter.
 */
export function fromDatetimeLocalValue(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}
