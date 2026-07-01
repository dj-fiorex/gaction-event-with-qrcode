'use server'

import * as XLSX from 'xlsx'
import { isAuthenticated } from './auth'
import { getEvents, getRegistrations } from './queries'
import { formatDateTime } from './format'
import type { ActionResult } from './types'

interface ExportRow {
  Evento: string
  Dipendente: string
  Email: string
  Reparto: string
  Bambini: number
  'Nomi bambini': string
  'Codice ticket': string
  Stato: string
  'Utilizzato il': string
  'Registrato il': string
}

export async function exportRegistrationsXlsx(
  eventId?: string,
): Promise<ActionResult<{ base64: string; filename: string }>> {
  if (!(await isAuthenticated())) {
    return { success: false, error: 'Accesso non autorizzato' }
  }

  const events = getEvents()
  const eventById = new Map(events.map((e) => [e.id, e]))
  const registrations = getRegistrations(eventId)

  if (registrations.length === 0) {
    return { success: false, error: 'Nessuna registrazione da esportare' }
  }

  const rows: ExportRow[] = registrations.map((r) => ({
    Evento: eventById.get(r.eventId)?.title ?? r.eventId,
    Dipendente: r.employeeName,
    Email: r.employeeEmail,
    Reparto: r.department,
    Bambini: r.children.length,
    'Nomi bambini': r.children.map((c) => `${c.name} (${c.age})`).join(', '),
    'Codice ticket': r.ticketCode,
    Stato: r.used ? 'Utilizzato' : 'Valido',
    'Utilizzato il': r.usedAt ? formatDateTime(r.usedAt) : '-',
    'Registrato il': formatDateTime(r.createdAt),
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 26 },
    { wch: 22 },
    { wch: 26 },
    { wch: 16 },
    { wch: 8 },
    { wch: 28 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrazioni')

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string
  const suffix = eventId ? eventById.get(eventId)?.title ?? eventId : 'tutti-gli-eventi'
  const filename = `registrazioni-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return { success: true, data: { base64, filename: `${filename}.xlsx` } }
}
