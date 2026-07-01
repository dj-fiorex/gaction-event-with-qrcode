'use server'

import * as XLSX from 'xlsx'
import { isAdmin } from './auth'
import { getEvents, getRegistrations } from './queries'
import { formatDateTime } from './format'
import type { ActionResult, Event, PersonCategory } from './types'

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

function activitiesLabel(event: Event | undefined, selections: { activityId: string }[]): string {
  if (!event) return '-'
  return selections
    .map((s) => event.activities.find((a) => a.id === s.activityId)?.title ?? s.activityId)
    .join(', ')
}

export async function exportRegistrationsXlsx(
  eventId?: string,
): Promise<ActionResult<{ base64: string; filename: string }>> {
  if (!(await isAdmin())) {
    return { success: false, error: 'Accesso non autorizzato' }
  }

  const events = getEvents()
  const eventById = new Map(events.map((e) => [e.id, e]))
  const registrations = getRegistrations(eventId)

  if (registrations.length === 0) {
    return { success: false, error: 'Nessuna registrazione da esportare' }
  }

  const rows: ExportRow[] = []
  for (const r of registrations) {
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

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Persone')

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string
  const suffix = eventId ? eventById.get(eventId)?.title ?? eventId : 'tutti-gli-eventi'
  const filename = `registrazioni-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return { success: true, data: { base64, filename: `${filename}.xlsx` } }
}
