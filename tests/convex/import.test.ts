/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { IMPORTED_CONSENT_NOTICE } from '../../convex/registrations'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createAdmin(t: ReturnType<typeof convexTest>) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'admin@example.com',
      name: 'admin',
      role: 'admin',
      emailVerificationTime: Date.now(),
    }),
  )
  return t.withIdentity({ subject: subjectFor(adminId) })
}

/**
 * Un Evento come Maestri d'Acciaio: Figli e Ospiti ammessi, una visita ad
 * accesso libero e un laboratorio a fasce. La Nota è **spenta**: l'import la
 * scrive lo stesso (ADR 0020).
 */
async function createEventFixture(
  t: ReturnType<typeof convexTest>,
  {
    maxChildren = 5,
    maxCompanions = 2,
    privacyNotice,
  }: { maxChildren?: number; maxCompanions?: number; privacyNotice?: string } = {},
) {
  return t.run(async (ctx) => {
    const eventId = await ctx.db.insert('events', {
      title: "Maestri d'Acciaio",
      description: '',
      location: 'Stabilimento',
      activityPolicy: 'all',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: true,
      maxChildrenPerRegistration: maxChildren,
      allowCompanions: true,
      maxCompanionsPerRegistration: maxCompanions,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
      ...(privacyNotice === undefined ? {} : { privacyNotice }),
    })
    const visitId = await ctx.db.insert('activities', {
      eventId,
      title: 'Visita allo stabilimento',
      start: '2026-09-26T13:00:00.000Z',
      end: '2026-09-26T15:00:00.000Z',
      slotDurationMinutes: 120,
      capacityPerSlot: 0,
      freeAccess: true,
      order: 0,
    })
    const visitSlotId = await ctx.db.insert('slots', {
      eventId,
      activityId: visitId,
      start: '2026-09-26T13:00:00.000Z',
      end: '2026-09-26T15:00:00.000Z',
      capacity: null,
      order: 0,
    })
    const labId = await ctx.db.insert('activities', {
      eventId,
      title: 'Laboratorio',
      start: '2026-09-26T15:00:00.000Z',
      end: '2026-09-26T16:00:00.000Z',
      slotDurationMinutes: 60,
      capacityPerSlot: 10,
      order: 1,
    })
    const labSlotId = await ctx.db.insert('slots', {
      eventId,
      activityId: labId,
      start: '2026-09-26T15:00:00.000Z',
      end: '2026-09-26T16:00:00.000Z',
      capacity: 10,
      order: 0,
    })
    return { eventId, visitId, visitSlotId, labId, labSlotId }
  })
}

const dalila = {
  row: 2,
  firstName: 'Dalila',
  lastName: 'Ancona',
  email: 'd.ancona@acciaivender.it',
  participates: true,
  childrenAges: [4, 1],
  companionsCount: 1,
  notes: 'Arriviamo con due passeggini.',
}

const dario = {
  row: 3,
  firstName: 'Dario',
  lastName: 'Profeta',
  email: 'dario@example.com',
  participates: false,
  childrenAges: [],
  companionsCount: 0,
  notes: 'Devo andare a Palermo.',
}

/* ------------------------------------------------------------------ *
 * Import delle risposte (ADR 0020)
 * ------------------------------------------------------------------ */

test('un «sì» diventa una Prenotazione completa, iscritta alla sola visita libera e senza Consegna', async () => {
  const t = convexTest(schema, modules)
  const asAdmin = await createAdmin(t)
  const { eventId, visitId, visitSlotId } = await createEventFixture(t)

  const report = await asAdmin.mutation(api.registrations.importResponses, {
    eventId,
    responses: [dalila],
  })
  expect(report).toEqual({ imported: 1, declined: 0, skipped: [] })

  const [registration] = await t.run((ctx) => ctx.db.query('registrations').collect())
  expect(registration).toMatchObject({
    eventId,
    contactEmail: 'd.ancona@acciaivender.it',
    // La Nota entra anche con `collectNotes` spento: il dato esiste già.
    notes: 'Arriviamo con due passeggini.',
    // Il consenso non è alle nostre parole: la riga non lo finge.
    privacyNoticeAccepted: IMPORTED_CONSENT_NOTICE,
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registration._id))
      .collect(),
  )
  expect(persons.map((p) => [p.firstName, p.lastName ?? null, p.category, p.age, p.nameProvided]))
    .toEqual([
      ['Dalila', 'Ancona', 'user', null, true],
      ['Figlio 1', null, 'child', 4, false],
      ['Figlio 2', null, 'child', 1, false],
      ['Ospite 1', null, 'companion', null, false],
    ])
  expect(new Set(persons.map((p) => p.ticketCode)).size).toBe(4)

  // Tutte le Attività ad accesso libero, nessuna a Slot.
  const selections = await t.run((ctx) => ctx.db.query('slotSelections').collect())
  expect(selections.map((s) => [s.activityId, s.slotId])).toEqual([[visitId, visitSlotId]])

  // Nessuna email all'import: è l'assenza che il tasto cerca.
  expect(await t.run((ctx) => ctx.db.query('emailDeliveries').collect())).toEqual([])
})

test('un «no» diventa una Rinuncia con la sua nota, datata all’import', async () => {
  const t = convexTest(schema, modules)
  const asAdmin = await createAdmin(t)
  const { eventId } = await createEventFixture(t)

  const before = Date.now()
  const report = await asAdmin.mutation(api.registrations.importResponses, {
    eventId,
    responses: [dario],
  })
  expect(report).toEqual({ imported: 0, declined: 1, skipped: [] })

  const [decline] = await t.run((ctx) => ctx.db.query('declines').collect())
  expect(decline).toMatchObject({
    eventId,
    firstName: 'Dario',
    lastName: 'Profeta',
    email: 'dario@example.com',
    notes: 'Devo andare a Palermo.',
    privacyNoticeAccepted: IMPORTED_CONSENT_NOTICE,
  })
  expect(new Date(decline.respondedAt).getTime()).toBeGreaterThanOrEqual(before)
  expect(await t.run((ctx) => ctx.db.query('registrations').collect())).toEqual([])
})

test('l’import è riservato all’admin', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)
  await expect(
    t.mutation(api.registrations.importResponses, { eventId, responses: [dalila] }),
  ).rejects.toThrow('Non autenticato')
})

test('la riga che viola una regola si salta e si riporta, le altre entrano', async () => {
  const t = convexTest(schema, modules)
  const asAdmin = await createAdmin(t)
  const { eventId, labId, labSlotId } = await createEventFixture(t, { maxCompanions: 1 })

  // Una Prenotazione dal form, prima dell'import: la sua email è già presa.
  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Giulia',
    userLastName: 'Verdi',
    contactEmail: 'Giulia@Example.com',
    children: [],
    companions: [],
    selections: [{ activityId: labId, slotId: labSlotId }],
  })

  const report = await asAdmin.mutation(api.registrations.importResponses, {
    eventId,
    responses: [
      dalila,
      { ...dalila, row: 3, email: 'giulia@example.com ', firstName: 'Giulia' },
      { ...dalila, row: 4, email: 'D.Ancona@acciaivender.it', firstName: 'Doppione' },
      { ...dalila, row: 5, email: 'camilla@example.com', firstName: 'Camilla', companionsCount: 2 },
      { ...dalila, row: 6, email: 'adulto@example.com', firstName: 'Adulto', childrenAges: [18] },
      { ...dalila, row: 7, email: 'non-una-email', firstName: 'Senza' },
      { ...dario, row: 8 },
      { ...dario, row: 9, firstName: 'Ancora' },
    ],
  })

  expect(report.imported).toBe(1)
  expect(report.declined).toBe(1)
  expect(report.skipped).toEqual([
    { row: 3, name: 'Giulia Ancona', reason: expect.stringContaining('già iscritta') },
    { row: 4, name: 'Doppione Ancona', reason: expect.stringContaining('già iscritta') },
    { row: 5, name: 'Camilla Ancona', reason: 'Puoi aggiungere al massimo 1 ospiti' },
    {
      row: 6,
      name: 'Adulto Ancona',
      reason: 'L’età di un figlio deve essere un numero intero tra 0 e 17',
    },
    { row: 7, name: 'Senza Ancona', reason: 'Indirizzo email non valido' },
    { row: 9, name: 'Ancora Profeta', reason: expect.stringContaining('già una rinuncia') },
  ])

  // Una riga saltata non lascia mezza Prenotazione.
  const registrations = await t.run((ctx) => ctx.db.query('registrations').collect())
  expect(registrations.map((r) => r.contactEmail).sort()).toEqual([
    'Giulia@Example.com',
    'd.ancona@acciaivender.it',
  ])
  const persons = await t.run((ctx) => ctx.db.query('persons').collect())
  expect(persons).toHaveLength(1 + 4)
})

test('lo stesso file caricato due volte aggiunge solo ciò che manca', async () => {
  const t = convexTest(schema, modules)
  const asAdmin = await createAdmin(t)
  const { eventId } = await createEventFixture(t)

  const first = await asAdmin.mutation(api.registrations.importResponses, {
    eventId,
    responses: [dalila, dario],
  })
  expect(first).toMatchObject({ imported: 1, declined: 1 })

  const second = await asAdmin.mutation(api.registrations.importResponses, {
    eventId,
    responses: [dalila, dario, { ...dalila, row: 4, email: 'nuova@example.com' }],
  })
  expect(second).toMatchObject({ imported: 1, declined: 0 })
  expect(second.skipped.map((s) => s.row)).toEqual([2, 3])

  expect(await t.run((ctx) => ctx.db.query('registrations').collect())).toHaveLength(2)
  expect(await t.run((ctx) => ctx.db.query('declines').collect())).toHaveLength(1)
})

/* ------------------------------------------------------------------ *
 * Invio massivo dell'email di conferma (ADR 0020)
 * ------------------------------------------------------------------ */

test('l’invio massivo apre una Consegna per ogni Prenotazione senza Consegna, e al secondo clic non trova nessuno', async () => {
  const t = convexTest(schema, modules)
  const asAdmin = await createAdmin(t)
  const { eventId, labId, labSlotId } = await createEventFixture(t)

  // Dal form: la Consegna nasce con la Prenotazione (ADR 0015).
  const { registrationId: fromForm } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Giulia',
    userLastName: 'Verdi',
    contactEmail: 'giulia@example.com',
    children: [],
    companions: [],
    selections: [{ activityId: labId, slotId: labSlotId }],
  })
  await asAdmin.mutation(api.registrations.importResponses, {
    eventId,
    responses: [dalila, { ...dalila, row: 3, email: 'seconda@example.com' }, dario],
  })

  const first = await asAdmin.mutation(api.registrations.sendPendingConfirmations, { eventId })
  expect(first).toEqual({ sent: 2 })

  const deliveries = await t.run((ctx) => ctx.db.query('emailDeliveries').collect())
  expect(deliveries.map((d) => d.recipient).sort()).toEqual([
    'd.ancona@acciaivender.it',
    'giulia@example.com',
    'seconda@example.com',
  ])
  expect(deliveries.every((d) => d.outcome === 'pending')).toBe(true)
  // La Prenotazione dal form non riceve un doppione.
  expect(deliveries.filter((d) => d.registrationId === fromForm)).toHaveLength(1)

  const second = await asAdmin.mutation(api.registrations.sendPendingConfirmations, { eventId })
  expect(second).toEqual({ sent: 0 })
  expect(await t.run((ctx) => ctx.db.query('emailDeliveries').collect())).toHaveLength(3)
})

test('l’invio massivo è riservato all’admin', async () => {
  const t = convexTest(schema, modules)
  const { eventId } = await createEventFixture(t)
  await expect(
    t.mutation(api.registrations.sendPendingConfirmations, { eventId }),
  ).rejects.toThrow('Non autenticato')
})
