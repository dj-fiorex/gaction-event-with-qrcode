import * as XLSX from 'xlsx'
import { formatDateTime } from './format'
import { CATEGORY_LABEL } from './person-labels'
import { statusOfPerson, type CheckInMoment } from './person-status'
import type { Decline, EventWithStats, Registration } from './types'

interface ExportRow {
  Evento: string
  Persona: string
  Categoria: string
  Età: string
  Allergie: string
  Email: string
  'Codice QR': string
  Attività: string
  /** I tre momenti di Check-in (issue #39): trattino se mai registrati. */
  Ingresso: string
  Visita: string
  Uscita: string
  'Attività completate': number
  'Registrato il': string
}

/**
 * Un momento in una cella. Quando la Persona è passata più volte (riuso QR
 * attivo) la cella riporta anche l'ultimo passaggio e il totale: la sola prima
 * volta racconterebbe una giornata sbagliata a chi legge il foglio a evento
 * finito.
 */
function momentCell(moment: CheckInMoment): string {
  if (!moment.at) return '-'
  const first = formatDateTime(moment.at)
  if (moment.count <= 1) return first
  // Confronto sul testo reso: due passaggi nello stesso minuto stamperebbero
  // due volte lo stesso orario separati da una freccia.
  const last = moment.lastAt ? formatDateTime(moment.lastAt) : null
  const range = last !== null && last !== first ? ` → ${last}` : ''
  return `${first}${range} (${moment.count}×)`
}

function activitiesLabel(
  event: EventWithStats | undefined,
  selections: { activityId: string }[],
): string {
  if (!event) return '\u2014'
  return selections
    // Una selezione verso un'Attività che non esiste più (ADR 0008) non ha un
    // titolo da stampare: l'id grezzo del documento non dice nulla a chi legge
    // il foglio e traboccava nella colonna accanto.
    .map((s) => event.activities.find((a) => a.id === s.activityId)?.title ?? '—')
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
      const status = statusOfPerson(p, p.activityCheckIns)
      rows.push({
        Evento: event?.title ?? r.eventId,
        Persona: p.name,
        Categoria: CATEGORY_LABEL[p.category],
        Età: p.age != null ? String(p.age) : '-',
        // Allergie e intolleranze (issue #37): vuoto = nessuna dichiarazione.
        Allergie: p.allergies ?? '-',
        Email: r.contactEmail,
        'Codice QR': p.ticketCode,
        Attività: activities,
        // Stato consolidato (issue #39): gli stessi tre momenti che l'operatore
        // vede sulla result card dello scanner.
        Ingresso: momentCell(status.entry),
        Visita: momentCell(status.activity),
        Uscita: momentCell(status.exit),
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
    { wch: 26 }, // Evento
    { wch: 22 }, // Persona
    { wch: 16 }, // Categoria
    { wch: 6 }, // Età
    { wch: 30 }, // Allergie
    { wch: 26 }, // Email
    { wch: 18 }, // Codice QR
    { wch: 30 }, // Attività
    { wch: 22 }, // Ingresso
    { wch: 22 }, // Visita
    { wch: 22 }, // Uscita
    { wch: 10 }, // Attività completate
    { wch: 18 }, // Registrato il
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
