/// <reference types="vite/client" />

/**
 * Identità stabile di Attività e Slot attraverso la modifica di un Evento
 * (ADR 0008, issue #44). Il salvataggio di un Evento non deve sganciare le
 * Prenotazioni già fatte: si cancella l'impegno (la selezione), non il fatto
 * (Prenotazione, Persone, biglietti, check-in registrati).
 */

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../../lib/format'

const modules = import.meta.glob('../../convex/**/*.ts')

/** `convexTest` legato allo schema di questo progetto: senza, gli indici delle tabelle non si tipizzano. */
function createTestApp() {
  return convexTest(schema, modules)
}
type TestApp = ReturnType<typeof createTestApp>

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createAdmin(t: TestApp) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    }),
  )
}

interface ActivityInput {
  id?: Id<'activities'>
  title: string
  start: string
  end: string
  slotDurationMinutes: number
  capacityPerSlot: number
}

const LABORATORIO: ActivityInput = {
  title: 'Laboratorio',
  start: '2026-07-07T09:00',
  end: '2026-07-07T10:00',
  slotDurationMinutes: 60,
  capacityPerSlot: 10,
}

const VISITA: ActivityInput = {
  title: 'Visita guidata',
  start: '2026-07-07T11:00',
  end: '2026-07-07T12:00',
  slotDurationMinutes: 60,
  capacityPerSlot: 10,
}

function buildEventInput(activities: ActivityInput[]) {
  return {
    title: 'Evento test',
    description: 'Descrizione abbastanza lunga',
    location: 'Roma',
    activityPolicy: 'free' as const,
    minActivities: 0,
    allowOverlap: false,
    checkInToleranceMinutes: 15,
    allowQrReuse: false,
    requireAccount: false,
    confirmParticipation: false,
    collectNames: true,
    collectAllergies: false,
    recordExit: false,
    allowChildren: true,
    maxChildrenPerRegistration: 2,
    allowCompanions: false,
    maxCompanionsPerRegistration: 0,
    checkInAccess: 'private' as const,
    checkInPassword: '',
    activities,
  }
}

/** Le Attività dell'Evento così come le rimanda il form: con il proprio id. */
function asFormActivities(
  event: { activities: { id: string; title: string; start: string; end: string; slotDurationMinutes: number; capacityPerSlot: number }[] },
): ActivityInput[] {
  return event.activities.map((a) => ({
    id: a.id as Id<'activities'>,
    title: a.title,
    start: a.start,
    end: a.end,
    slotDurationMinutes: a.slotDurationMinutes,
    capacityPerSlot: a.capacityPerSlot,
  }))
}

/** Evento con due Attività e una Prenotazione da due Persone su entrambe. */
async function setupEventWithBooking(activities: ActivityInput[] = [LABORATORIO, VISITA]) {
  const t = createTestApp()
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(api.events.create, buildEventInput(activities))
  const event = await asAdmin.query(api.events.getForAdmin, { eventId })
  if (!event) throw new Error('Evento non creato')

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Mario Rossi',
    contactEmail: 'mario@example.com',
    children: [{ name: 'Luca Rossi', age: 8 }],
    companions: [],
    selections: event.activities.map((a) => ({
      activityId: a.id as Id<'activities'>,
      slotId: a.slots[0].id as Id<'slots'>,
    })),
  })

  return { t, asAdmin, eventId, event, registrationId }
}

async function selectionsOf(t: TestApp, eventId: Id<'events'>) {
  return t.run((ctx) =>
    ctx.db
      .query('slotSelections')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect(),
  )
}

test('salvare senza toccare il programma lascia intatte tutte le selezioni', async () => {
  const { t, asAdmin, eventId, event } = await setupEventWithBooking()
  const before = await selectionsOf(t, eventId)

  await asAdmin.mutation(api.events.update, {
    eventId,
    ...buildEventInput(asFormActivities(event)),
    description: 'Descrizione corretta da un refuso',
  })

  const after = await selectionsOf(t, eventId)
  expect(after.map((s) => s._id).sort()).toEqual(before.map((s) => s._id).sort())
  expect(after.map((s) => `${s.activityId}|${s.slotId}`).sort()).toEqual(
    before.map((s) => `${s.activityId}|${s.slotId}`).sort(),
  )
})

test('cambiare titolo e capienza di un’Attività ne conserva id e selezioni', async () => {
  const { t, asAdmin, eventId, event } = await setupEventWithBooking()
  const before = await selectionsOf(t, eventId)
  const activities = asFormActivities(event)
  activities[0] = { ...activities[0], title: 'Laboratorio di ceramica', capacityPerSlot: 20 }

  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  expect(updated?.activities[0].id).toBe(event.activities[0].id)
  expect(updated?.activities[0].title).toBe('Laboratorio di ceramica')
  expect(updated?.activities[0].slots[0].capacity).toBe(20)

  const after = await selectionsOf(t, eventId)
  expect(after.map((s) => s._id).sort()).toEqual(before.map((s) => s._id).sort())
  // Lo Slot prenotato resta lo stesso documento: il posto è ancora occupato.
  expect(updated?.activities[0].slots[0].id).toBe(event.activities[0].slots[0].id)
  expect(updated?.activities[0].slots[0].taken).toBe(2)
})

test('allargare la finestra conserva gli Slot già prenotati e aggiunge i nuovi', async () => {
  const { asAdmin, eventId, event } = await setupEventWithBooking([
    { ...LABORATORIO, slotDurationMinutes: 30 },
  ])
  expect(event.activities[0].slots).toHaveLength(2)
  const keptSlotIds = event.activities[0].slots.map((s) => s.id)

  const activities = asFormActivities(event)
  // Stesso formato del form (ora locale, come `datetime-local`): la finestra
  // raddoppia e gli Slot passano da 2 a 4.
  activities[0] = { ...activities[0], end: '2026-07-07T11:00' }
  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  const slots = updated?.activities[0].slots ?? []
  expect(slots).toHaveLength(4)
  expect(slots.slice(0, 2).map((s) => s.id)).toEqual(keptSlotIds)
  expect(slots[0].taken).toBe(2)
})

test('togliere un’Attività cancella solo le sue selezioni, non la Prenotazione', async () => {
  const { t, asAdmin, eventId, event, registrationId } = await setupEventWithBooking()
  const removed = event.activities[1]
  const kept = event.activities[0]

  // Un check-in già registrato sull'Attività che sta per sparire: è un fatto.
  const personId = await t.run(async (ctx) => {
    const persons = await ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect()
    await ctx.db.insert('activityCheckIns', {
      personId: persons[0]._id,
      eventId,
      activityId: removed.id as Id<'activities'>,
      slotId: removed.slots[0].id as Id<'slots'>,
      at: '2026-07-07T11:05:00.000Z',
      count: 1,
      lastAt: '2026-07-07T11:05:00.000Z',
    })
    return persons[0]._id
  })

  const activities = asFormActivities(event).filter((a) => a.id !== removed.id)
  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  // L'impegno sparisce…
  const after = await selectionsOf(t, eventId)
  expect(after).toHaveLength(1)
  expect(after[0].activityId).toBe(kept.id)
  expect(after[0].slotId).toBe(kept.slots[0].id)

  // …e con esso Attività e Slot.
  expect(await t.run((ctx) => ctx.db.get(removed.id as Id<'activities'>))).toBeNull()
  expect(await t.run((ctx) => ctx.db.get(removed.slots[0].id as Id<'slots'>))).toBeNull()

  // Il fatto resta: Prenotazione, Persone, biglietti e check-in registrati.
  const registrations = await asAdmin.query(api.registrations.listAll, {})
  const registration = registrations.find((r) => r.id === registrationId)
  expect(registration).toBeDefined()
  expect(registration?.persons).toHaveLength(2)
  expect(registration?.persons.every((p) => p.ticketCode.length > 0)).toBe(true)
  const person = registration?.persons.find((p) => p.id === personId)
  expect(person?.activityCheckIns).toHaveLength(1)
  expect(person?.activityCheckIns[0].activityId).toBe(removed.id)
})

test('l’ingresso all’Evento resta valido dopo la rimozione di un’Attività', async () => {
  const { t, asAdmin, eventId, event, registrationId } = await setupEventWithBooking()
  const ticketCode = await t.run(async (ctx) => {
    const persons = await ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect()
    return persons[0].ticketCode
  })

  const activities = asFormActivities(event).filter((a) => a.id !== event.activities[1].id)
  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const result = await asAdmin.mutation(api.checkins.checkIn, {
    eventId,
    code: ticketCode,
    mode: 'event',
  })
  expect(result.status).toBe('event-valid')
})

test('un’Attività aggiunta in modifica non tocca quelle esistenti', async () => {
  const { t, asAdmin, eventId, event } = await setupEventWithBooking([LABORATORIO])
  const before = await selectionsOf(t, eventId)

  const activities = [...asFormActivities(event), VISITA]
  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  expect(updated?.activities).toHaveLength(2)
  expect(updated?.activities[0].id).toBe(event.activities[0].id)
  expect(updated?.activities[1].title).toBe('Visita guidata')
  expect(await selectionsOf(t, eventId)).toHaveLength(before.length)
})

test('un id di Attività estraneo all’Evento viene trattato come nuova Attività', async () => {
  const { asAdmin, eventId, event } = await setupEventWithBooking([LABORATORIO])
  const other = await asAdmin.mutation(api.events.create, buildEventInput([VISITA]))
  const otherEvent = await asAdmin.query(api.events.getForAdmin, { eventId: other.id })

  const activities = asFormActivities(event)
  activities.push({ ...VISITA, id: otherEvent?.activities[0].id as Id<'activities'> })
  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  expect(updated?.activities).toHaveLength(2)
  expect(updated?.activities[1].id).not.toBe(otherEvent?.activities[0].id)
  // L'Attività dell'altro Evento non è stata rubata né spostata.
  const untouched = await asAdmin.query(api.events.getForAdmin, { eventId: other.id })
  expect(untouched?.activities).toHaveLength(1)
  expect(untouched?.activities[0].id).toBe(otherEvent?.activities[0].id)
})

test('events.activityRegistrationImpact conta Prenotazioni e Persone per Attività', async () => {
  const { asAdmin, eventId, event } = await setupEventWithBooking()

  const impact = await asAdmin.query(api.events.activityRegistrationImpact, { eventId })
  const byActivity = new Map<string, (typeof impact)[number]>(
    impact.map((i) => [i.activityId, i]),
  )
  expect(byActivity.get(event.activities[0].id)).toEqual({
    activityId: event.activities[0].id,
    registrations: 1,
    persons: 2,
    slots: [
      {
        start: event.activities[0].slots[0].start,
        end: event.activities[0].slots[0].end,
        registrations: 1,
        persons: 2,
      },
    ],
  })
  expect(byActivity.get(event.activities[1].id)?.persons).toBe(2)
})

test('events.activityRegistrationImpact è riservata agli admin', async () => {
  const { t, eventId } = await setupEventWithBooking()
  await expect(t.query(api.events.activityRegistrationImpact, { eventId })).rejects.toThrow()
})

test('il giro completo attraverso il form non sposta gli orari né le selezioni', async () => {
  const { t, asAdmin, eventId, event } = await setupEventWithBooking()
  const before = await selectionsOf(t, eventId)

  // Il percorso vero: la pagina di modifica rende l'istante in ora locale per
  // <input type="datetime-local">, il form lo riconverte in istante prima di
  // spedirlo. Con un fuso diverso da UTC un giro che perde l'offset sposta gli
  // orari, gli Slot non si riconoscono più e le selezioni spariscono.
  const activities = event.activities.map((a) => ({
    id: a.id as Id<'activities'>,
    title: a.title,
    start: fromDatetimeLocalValue(toDatetimeLocalValue(a.start)),
    end: fromDatetimeLocalValue(toDatetimeLocalValue(a.end)),
    slotDurationMinutes: a.slotDurationMinutes,
    capacityPerSlot: a.capacityPerSlot,
  }))
  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  expect(updated?.activities[0].start).toBe(event.activities[0].start)
  expect(updated?.activities[0].slots[0].id).toBe(event.activities[0].slots[0].id)

  const after = await selectionsOf(t, eventId)
  expect(after.map((s) => s._id).sort()).toEqual(before.map((s) => s._id).sort())
})

test('accorciare la finestra cancella solo le selezioni delle fasce sparite', async () => {
  // 09:00–11:00 a fasce di 60': due Slot, la Prenotazione sta sul secondo.
  const { t, asAdmin, eventId, event } = await setupEventWithBooking([
    { ...LABORATORIO, end: '2026-07-07T11:00' },
  ])
  const [primo, secondo] = event.activities[0].slots
  expect(event.activities[0].slots).toHaveLength(2)

  const registrationId = await t.run(async (ctx) => {
    const reg = await ctx.db.insert('registrations', { eventId, contactEmail: 'anna@example.com' })
    await ctx.db.insert('persons', {
      registrationId: reg,
      eventId,
      name: 'Anna Bianchi',
      category: 'user',
      age: null,
      ticketCode: 'TCK-TEST-0001',
      eventCheckInAt: null,
      eventCheckInCount: 0,
      eventCheckInLastAt: null,
    })
    await ctx.db.insert('slotSelections', {
      registrationId: reg,
      eventId,
      activityId: event.activities[0].id as Id<'activities'>,
      slotId: secondo.id as Id<'slots'>,
    })
    return reg
  })

  const activities = asFormActivities(event)
  activities[0] = { ...activities[0], end: primo.end }
  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const after = await selectionsOf(t, eventId)
  // Resta solo la selezione sulla fascia sopravvissuta.
  expect(after).toHaveLength(1)
  expect(after[0].slotId).toBe(primo.id)
  expect(await t.run((ctx) => ctx.db.get(secondo.id as Id<'slots'>))).toBeNull()
  // La Prenotazione che ha perso la fascia resta, con la sua Persona.
  expect(await t.run((ctx) => ctx.db.get(registrationId))).not.toBeNull()
  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(persons).toHaveLength(1)
})

test('cambiare la Durata rigenera le fasce e le selezioni non sopravvivono', async () => {
  // È il caso che l'avviso deve nominare: nessuna finestra coincide più.
  const { t, asAdmin, eventId, event } = await setupEventWithBooking([
    { ...LABORATORIO, slotDurationMinutes: 30 },
  ])
  const activities = asFormActivities(event)
  activities[0] = { ...activities[0], slotDurationMinutes: 60 }

  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  expect(updated?.activities[0].slots).toHaveLength(1)
  // L'Attività conserva il proprio id: a sparire sono le fasce, non lei.
  expect(updated?.activities[0].id).toBe(event.activities[0].id)
  expect(await selectionsOf(t, eventId)).toHaveLength(0)
  // La Prenotazione e le Persone restano.
  const registrations = await asAdmin.query(api.registrations.listAll, {})
  expect(registrations[0].persons).toHaveLength(2)
})

test('due voci con lo stesso id non fondono in un’unica Attività', async () => {
  const { t, asAdmin, eventId, event } = await setupEventWithBooking([LABORATORIO])
  const activities = asFormActivities(event)
  // Payload manomesso: l'id ripetuto non può identificare due Attività.
  activities.push({ ...activities[0], title: 'Copia', start: VISITA.start, end: VISITA.end })

  await asAdmin.mutation(api.events.update, { eventId, ...buildEventInput(activities) })

  const updated = await asAdmin.query(api.events.getForAdmin, { eventId })
  expect(updated?.activities).toHaveLength(2)
  expect(updated?.activities[0].id).toBe(event.activities[0].id)
  expect(updated?.activities[1].id).not.toBe(event.activities[0].id)
  expect(await selectionsOf(t, eventId)).toHaveLength(1)
})

test('events.activityRegistrationImpact riporta solo le fasce prenotate', async () => {
  const { asAdmin, eventId, event } = await setupEventWithBooking([
    { ...LABORATORIO, slotDurationMinutes: 30 },
  ])
  const impact = await asAdmin.query(api.events.activityRegistrationImpact, { eventId })
  expect(event.activities[0].slots).toHaveLength(2)
  // La Prenotazione occupa la prima fascia: la seconda non ha nulla da dire.
  expect(impact[0].slots).toHaveLength(1)
  expect(impact[0].slots[0].start).toBe(event.activities[0].slots[0].start)
  expect(impact[0].slots[0].persons).toBe(2)
})
