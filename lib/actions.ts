'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from './db'
import {
  createSession,
  destroySession,
  isAdmin,
  isAuthenticated,
  verifyCredentials,
} from './auth'
import { sendTicketsEmail } from './email'
import { generateQrDataUrl, generateTicketCode } from './qr'
import { computeStats, findActivity, findPersonByTicket, findSlot, slotTaken } from './queries'
import { eventSchema, loginSchema, registrationSchema, type EventInput } from './schemas'
import { generateSlots, intervalsOverlap } from './slots'
import type {
  ActionResult,
  Activity,
  CheckInMode,
  CheckInResult,
  Event,
  Person,
  Registration,
} from './types'

async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error('Accesso non autorizzato')
  }
}

/* ------------------------------------------------------------------ */
/* Registrazione pubblica                                              */
/* ------------------------------------------------------------------ */

export interface RegisteredPerson {
  name: string
  category: Person['category']
  age: number | null
  ticketCode: string
  qrDataUrl: string
}

export async function registerForEvent(
  input: unknown,
): Promise<ActionResult<{ persons: RegisteredPerson[]; emailSimulated: boolean }>> {
  const parsed = registrationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' }
  }
  const data = parsed.data

  const event = db.events.find((e) => e.id === data.eventId)
  if (!event) {
    return { success: false, error: 'Evento non trovato' }
  }

  const children = event.allowChildren ? data.children : []
  const companions = event.allowCompanions ? data.companions : []

  if (children.length > event.maxChildrenPerRegistration) {
    return { success: false, error: `Puoi aggiungere al massimo ${event.maxChildrenPerRegistration} figli` }
  }
  if (companions.length > event.maxCompanionsPerRegistration) {
    return {
      success: false,
      error: `Puoi aggiungere al massimo ${event.maxCompanionsPerRegistration} accompagnatori`,
    }
  }

  const selectionError = validateSelections(event, data.selections)
  if (selectionError) {
    return { success: false, error: selectionError }
  }

  const persons: Person[] = [
    buildPerson(data.userName, 'user', null),
    ...children.map((c) => buildPerson(c.name, 'child', c.age)),
    ...companions.map((c) => buildPerson(c.name, 'companion', null)),
  ]

  // Verifica di capacità atomica: ogni Slot selezionato deve avere posti per
  // tutte le Persone della Prenotazione, altrimenti l'intera operazione fallisce.
  for (const selection of data.selections) {
    const activity = findActivity(event, selection.activityId)
    const slot = activity && findSlot(activity, selection.slotId)
    if (!activity || !slot) {
      return { success: false, error: 'Selezione attività non valida' }
    }
    const available = slot.capacity - slotTaken(event.id, slot.id)
    if (persons.length > available) {
      return {
        success: false,
        error: `Posti insufficienti per "${activity.title}": restano ${available} posti nello slot scelto`,
      }
    }
  }

  const registration: Registration = {
    id: randomUUID(),
    eventId: event.id,
    contactEmail: data.contactEmail,
    selections: data.selections,
    persons,
    createdAt: new Date().toISOString(),
  }
  db.registrations.push(registration)

  const registeredPersons: RegisteredPerson[] = await Promise.all(
    persons.map(async (p) => ({
      name: p.name,
      category: p.category,
      age: p.age,
      ticketCode: p.ticketCode,
      qrDataUrl: await generateQrDataUrl(p.ticketCode),
    })),
  )

  const emailResult = await sendTicketsEmail({ event, registration, persons: registeredPersons })

  revalidatePath('/')
  revalidatePath(`/eventi/${event.id}`)
  revalidatePath('/admin')

  return {
    success: true,
    data: { persons: registeredPersons, emailSimulated: emailResult.simulated },
  }
}

function buildPerson(name: string, category: Person['category'], age: number | null): Person {
  return {
    id: randomUUID(),
    name,
    category,
    age,
    ticketCode: generateTicketCode(),
    eventCheckInAt: null,
    activityCheckIns: [],
  }
}

function validateSelections(
  event: Event,
  selections: { activityId: string; slotId: string }[],
): string | null {
  const activityIds = new Set<string>()
  for (const s of selections) {
    if (activityIds.has(s.activityId)) {
      return 'Puoi selezionare un solo slot per attività'
    }
    activityIds.add(s.activityId)
    const activity = findActivity(event, s.activityId)
    if (!activity || !findSlot(activity, s.slotId)) {
      return 'Selezione attività non valida'
    }
  }

  if (event.activityPolicy === 'all' && activityIds.size !== event.activities.length) {
    return 'Devi selezionare uno slot per ogni attività'
  }
  if (event.activityPolicy === 'min' && selections.length < event.minActivities) {
    return `Devi selezionare almeno ${event.minActivities} attività`
  }
  if (event.activityPolicy === 'free' && selections.length === 0) {
    return 'Seleziona almeno un\u2019attività'
  }

  if (!event.allowOverlap) {
    const chosen = selections.map((s) => {
      const activity = findActivity(event, s.activityId) as Activity
      return findSlot(activity, s.slotId)!
    })
    for (let i = 0; i < chosen.length; i++) {
      for (let j = i + 1; j < chosen.length; j++) {
        if (intervalsOverlap(chosen[i].start, chosen[i].end, chosen[j].start, chosen[j].end)) {
          return 'Hai selezionato slot che si sovrappongono nel tempo'
        }
      }
    }
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export interface LoginState {
  error?: string
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dati non validi' }
  }
  const role = verifyCredentials(parsed.data.email, parsed.data.password)
  if (!role) {
    return { error: 'Credenziali non valide' }
  }
  await createSession(role)
  redirect(role === 'admin' ? '/admin' : '/admin/validazione')
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect('/admin/login')
}

/* ------------------------------------------------------------------ */
/* Gestione eventi (admin)                                             */
/* ------------------------------------------------------------------ */

/**
 * Costruisce le Attività (con Slot generati) a partire dall'input validato.
 * In modifica, `existingActivityIds` viene riusato per indice così da preservare
 * gli id di Attività/Slot già referenziati dalle Prenotazioni esistenti.
 */
function buildActivities(
  eventId: string,
  input: EventInput,
  existingActivityIds: string[] = [],
): Activity[] {
  return input.activities.map((a, index) => {
    const activityId = existingActivityIds[index] ?? `${eventId}-act-${index}`
    const start = new Date(a.start).toISOString()
    const end = new Date(a.end).toISOString()
    const slots = generateSlots(activityId, start, end, a.slotDurationMinutes, a.capacityPerSlot)
    return {
      id: activityId,
      eventId,
      title: a.title,
      start,
      end,
      slotDurationMinutes: a.slotDurationMinutes,
      capacityPerSlot: a.capacityPerSlot,
      slots,
    }
  })
}

/** Estrae i campi di configurazione dell'Evento dall'input validato. */
function eventSettingsFromInput(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    activityPolicy: input.activityPolicy,
    minActivities: input.activityPolicy === 'min' ? input.minActivities : 0,
    allowOverlap: input.allowOverlap,
    checkInToleranceMinutes: input.checkInToleranceMinutes,
    allowChildren: input.allowChildren,
    maxChildrenPerRegistration: input.allowChildren ? input.maxChildrenPerRegistration : 0,
    allowCompanions: input.allowCompanions,
    maxCompanionsPerRegistration: input.allowCompanions ? input.maxCompanionsPerRegistration : 0,
  }
}

export async function createEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin()
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' }
  }
  const d = parsed.data
  const id = `evt-${randomUUID().slice(0, 8)}`

  const activities = buildActivities(id, d)
  if (activities.some((a) => a.slots.length === 0)) {
    return {
      success: false,
      error: 'Un\u2019attività non genera slot: controlla finestra oraria e durata',
    }
  }

  db.events.push({
    id,
    ...eventSettingsFromInput(d),
    imageUrl: '/events/generic-event.png',
    createdAt: new Date().toISOString(),
    activities,
  })

  revalidatePath('/')
  revalidatePath('/admin')
  return { success: true, data: { id } }
}

export async function updateEvent(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin()
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' }
  }
  const index = db.events.findIndex((e) => e.id === id)
  if (index === -1) {
    return { success: false, error: 'Evento non trovato' }
  }
  const d = parsed.data
  const existing = db.events[index]

  const activities = buildActivities(id, d, existing.activities.map((a) => a.id))
  if (activities.some((a) => a.slots.length === 0)) {
    return {
      success: false,
      error: 'Un\u2019attività non genera slot: controlla finestra oraria e durata',
    }
  }

  db.events[index] = {
    ...existing,
    ...eventSettingsFromInput(d),
    activities,
  }

  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath(`/eventi/${id}`)
  return { success: true, data: { id } }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  await requireAdmin()
  const index = db.events.findIndex((e) => e.id === id)
  if (index === -1) {
    return { success: false, error: 'Evento non trovato' }
  }
  db.events.splice(index, 1)
  for (let i = db.registrations.length - 1; i >= 0; i--) {
    if (db.registrations[i].eventId === id) {
      db.registrations.splice(i, 1)
    }
  }
  revalidatePath('/')
  revalidatePath('/admin')
  return { success: true, data: undefined }
}

/* ------------------------------------------------------------------ */
/* Check-in (staff o admin)                                            */
/* ------------------------------------------------------------------ */

export async function checkInPerson(args: {
  code: string
  mode: CheckInMode
  activityId?: string
}): Promise<CheckInResult> {
  if (!(await isAuthenticated())) {
    throw new Error('Accesso non autorizzato')
  }

  const lookup = findPersonByTicket(args.code)
  if (!lookup) {
    return { status: 'not-found', message: 'QR non riconosciuto.' }
  }

  const { person, registration, event } = lookup
  const personSummary = {
    name: person.name,
    category: person.category,
    age: person.age,
    ticketCode: person.ticketCode,
  }

  if (args.mode === 'event') {
    if (person.eventCheckInAt) {
      return {
        status: 'event-already',
        message: 'Ingresso già registrato in precedenza.',
        person: personSummary,
        eventTitle: event.title,
        at: person.eventCheckInAt,
      }
    }
    person.eventCheckInAt = new Date().toISOString()
    revalidatePath('/admin')
    return {
      status: 'event-valid',
      message: 'Ingresso all\u2019evento consentito.',
      person: personSummary,
      eventTitle: event.title,
      at: person.eventCheckInAt,
    }
  }

  // mode === 'activity'
  const activity = args.activityId ? findActivity(event, args.activityId) : undefined
  if (!activity) {
    return {
      status: 'wrong-event',
      message: 'Questa persona non appartiene all\u2019attività selezionata.',
      person: personSummary,
      eventTitle: event.title,
    }
  }

  const selection = registration.selections.find((s) => s.activityId === activity.id)
  const slot = selection && findSlot(activity, selection.slotId)
  if (!selection || !slot) {
    return {
      status: 'not-registered-activity',
      message: `Non iscritto a "${activity.title}".`,
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
    }
  }

  const now = Date.now()
  const toleranceMs = event.checkInToleranceMinutes * 60_000
  const slotStart = new Date(slot.start).getTime()
  const slotEnd = new Date(slot.end).getTime()

  if (now < slotStart - toleranceMs) {
    return {
      status: 'too-early',
      message: 'Troppo presto: torna nella tua fascia oraria.',
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
      slotStart: slot.start,
      slotEnd: slot.end,
    }
  }
  if (now > slotEnd + toleranceMs) {
    return {
      status: 'too-late',
      message: 'Troppo tardi: la fascia oraria è terminata.',
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
      slotStart: slot.start,
      slotEnd: slot.end,
    }
  }

  const already = person.activityCheckIns.find((c) => c.activityId === activity.id)
  if (already) {
    return {
      status: 'activity-already',
      message: 'Check-in attività già effettuato.',
      person: personSummary,
      eventTitle: event.title,
      activityTitle: activity.title,
      slotStart: slot.start,
      slotEnd: slot.end,
      at: already.at,
    }
  }

  const at = new Date().toISOString()
  person.activityCheckIns.push({ activityId: activity.id, slotId: slot.id, at })
  revalidatePath('/admin')
  return {
    status: 'activity-valid',
    message: `Accesso a "${activity.title}" consentito.`,
    person: personSummary,
    eventTitle: event.title,
    activityTitle: activity.title,
    slotStart: slot.start,
    slotEnd: slot.end,
    at,
  }
}
