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

/** Solo l'orario (HH:mm) di un istante ISO. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Intervallo orario compatto, es. "10:00 – 10:30". */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} \u2013 ${formatTime(endIso)}`
}

/** Data + intervallo orario, es. "20 luglio 2026, 10:00 – 13:00". */
export function formatDateRange(startIso: string | null, endIso: string | null): string {
  if (!startIso) return 'Data da definire'
  const day = new Date(startIso).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  if (!endIso) return `${day}, ${formatTime(startIso)}`
  return `${day}, ${formatTimeRange(startIso, endIso)}`
}
