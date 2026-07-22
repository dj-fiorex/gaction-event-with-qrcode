import * as XLSX from 'xlsx'
import { formatDateTime } from './format'
import type { Decline, EventWithStats, PersonCategory, Registration } from './types'

const CATEGORY_LABEL: Record<PersonCategory, string> = {
  user: 'Iscritto',
  child: 'Figlio',
  companion: 'Accompagnatore',
}

interface ExportRow {
  Evento: string
  Persona: string
  Categoria: string
  Età: string
  Email: string
  'Codice QR': string
  Attività: string
  'Check-in evento': string
  'Attività completate': number
  'Registrato il': string
}

function activitiesLabel(
  event: EventWithStats | undefined,
  selections: { activityId: string }[],
): string {
  if (!event) return '-'
  return selections
    .map((s) => event.activities.find((a) => a.id === s.activityId)?.title ?? s.activityId)
    .join(', ')
}

interface DeclineRow {
  Evento: string
  Nome: string
  Email: string
  'Data risposta': string
}

/**
 * Costruisce e scarica un file XLSX delle registrazioni lato client,
 * usando i dati già caricati via Convex (nessuna round-trip al server).
 */
export function downloadRegistrationsXlsx(
  registrations: Registration[],
  events: EventWithStats[],
  eventId?: string,
  declines: Decline[] = [],
): void {
  const eventById = new Map(events.map((e) => [e.id, e]))
  const scoped = eventId ? registrations.filter((r) => r.eventId === eventId) : registrations
  const scopedDeclines = eventId ? declines.filter((d) => d.eventId === eventId) : declines

  const rows: ExportRow[] = []
  for (const r of scoped) {
    const event = eventById.get(r.eventId)
    const activities = activitiesLabel(event, r.selections)
    for (const p of r.persons) {
      rows.push({
        Evento: event?.title ?? r.eventId,
        Persona: p.name,
        Categoria: CATEGORY_LABEL[p.category],
        Età: p.age != null ? String(p.age) : '-',
        Email: r.contactEmail,
        'Codice QR': p.ticketCode,
        Attività: activities,
        'Check-in evento': p.eventCheckInAt ? formatDateTime(p.eventCheckInAt) : '-',
        'Attività completate': p.activityCheckIns.length,
        'Registrato il': formatDateTime(r.createdAt),
      })
    }
  }

  const declineRows: DeclineRow[] = scopedDeclines.map((d) => ({
    Evento: eventById.get(d.eventId)?.title ?? d.eventId,
    Nome: d.name,
    Email: d.email,
    'Data risposta': formatDateTime(d.respondedAt),
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 26 },
    { wch: 22 },
    { wch: 16 },
    { wch: 6 },
    { wch: 26 },
    { wch: 18 },
    { wch: 30 },
    { wch: 18 },
    { wch: 10 },
    { wch: 18 },
  ]

  const declinesWorksheet = XLSX.utils.json_to_sheet(declineRows, {
    header: ['Evento', 'Nome', 'Email', 'Data risposta'],
  })
  declinesWorksheet['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 26 }, { wch: 18 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Persone')
  XLSX.utils.book_append_sheet(workbook, declinesWorksheet, 'Rinunce')

  const suffix = eventId ? eventById.get(eventId)?.title ?? eventId : 'tutti-gli-eventi'
  const filename = `registrazioni-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  XLSX.writeFile(workbook, `${filename}.xlsx`)
}
