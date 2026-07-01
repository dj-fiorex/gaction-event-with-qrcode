'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from './db'
import {
  createSession,
  destroySession,
  isAuthenticated,
  verifyCredentials,
} from './auth'
import { sendTicketEmail } from './email'
import { generateQrDataUrl, generateTicketCode } from './qr'
import { computeStats } from './queries'
import {
  eventSchema,
  loginSchema,
  registrationSchema,
} from './schemas'
import type {
  ActionResult,
  Registration,
  TicketValidationResult,
} from './types'

async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error('Accesso non autorizzato')
  }
}

export async function registerForEvent(
  input: unknown,
): Promise<ActionResult<{ ticketCode: string; qrDataUrl: string; emailSimulated: boolean }>> {
  const parsed = registrationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' }
  }
  const data = parsed.data

  const event = db.events.find((e) => e.id === data.eventId)
  if (!event) {
    return { success: false, error: 'Evento non trovato' }
  }

  const children = event.childOptions.allowChildren ? data.children : []
  if (children.length > event.childOptions.maxChildrenPerRegistration) {
    return {
      success: false,
      error: `Puoi associare al massimo ${event.childOptions.maxChildrenPerRegistration} bambini`,
    }
  }

  const alreadyRegistered = db.registrations.some(
    (r) =>
      r.eventId === event.id &&
      r.employeeEmail.toLowerCase() === data.employeeEmail.toLowerCase(),
  )
  if (alreadyRegistered) {
    return { success: false, error: 'Questa email è già registrata a questo evento' }
  }

  const seatsRequested = 1 + children.length
  const stats = computeStats(event)
  if (seatsRequested > stats.seatsAvailable) {
    return { success: false, error: 'Posti non sufficienti per questa registrazione' }
  }

  const ticketCode = generateTicketCode()
  const registration: Registration = {
    id: randomUUID(),
    eventId: event.id,
    employeeName: data.employeeName,
    employeeEmail: data.employeeEmail,
    department: data.department,
    children,
    ticketCode,
    used: false,
    usedAt: null,
    createdAt: new Date().toISOString(),
  }
  db.registrations.push(registration)

  const qrDataUrl = await generateQrDataUrl(ticketCode)
  const emailResult = await sendTicketEmail({ registration, event, qrDataUrl })

  revalidatePath('/')
  revalidatePath(`/eventi/${event.id}`)
  revalidatePath('/admin')

  return {
    success: true,
    data: { ticketCode, qrDataUrl, emailSimulated: emailResult.simulated },
  }
}

export interface LoginState {
  error?: string
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dati non validi' }
  }
  if (!verifyCredentials(parsed.data.email, parsed.data.password)) {
    return { error: 'Credenziali non valide' }
  }
  await createSession()
  redirect('/admin')
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect('/admin/login')
}

export async function createEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin()
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' }
  }
  const d = parsed.data
  const id = `evt-${randomUUID().slice(0, 8)}`
  db.events.push({
    id,
    title: d.title,
    description: d.description,
    date: new Date(d.date).toISOString(),
    location: d.location,
    capacity: d.capacity,
    imageUrl: '/events/generic-event.png',
    childOptions: {
      allowChildren: d.allowChildren,
      maxChildrenPerRegistration: d.allowChildren ? d.maxChildrenPerRegistration : 0,
    },
    createdAt: new Date().toISOString(),
  })
  revalidatePath('/')
  revalidatePath('/admin')
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

/**
 * Valida un ticket dal codice del QR.
 * Al primo utilizzo valido il ticket viene marcato come usato (invalidazione).
 */
export async function validateTicket(code: string): Promise<TicketValidationResult> {
  await requireAdmin()
  const ticketCode = code.trim()
  const registration = db.registrations.find((r) => r.ticketCode === ticketCode)
  if (!registration) {
    return { status: 'not-found' }
  }
  const event = db.events.find((e) => e.id === registration.eventId)

  if (registration.used) {
    return {
      status: 'already-used',
      registration,
      event,
      usedAt: registration.usedAt,
    }
  }

  registration.used = true
  registration.usedAt = new Date().toISOString()
  revalidatePath('/admin')

  return {
    status: 'valid',
    registration,
    event,
    usedAt: registration.usedAt,
  }
}
