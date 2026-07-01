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
