import { randomUUID } from 'crypto'
import { generateSlots } from './slots'
import { generateTicketCode } from './qr'
import type { Activity, Event, Person, Registration } from './types'

/**
 * Database mock in memoria.
 *
 * I dati vivono nella memoria del processo del server e vengono resettati a
 * ogni riavvio / ridistribuzione. Sostituibile con un database reale
 * mantenendo la stessa interfaccia esposta dalle funzioni sottostanti.
 *
 * Usiamo globalThis per preservare lo stato attraverso gli hot-reload di Next.
 */

interface Store {
  events: Event[]
  registrations: Registration[]
}

const globalForDb = globalThis as unknown as {
  __eventStore?: Store
}

function buildActivity(
  eventId: string,
  id: string,
  title: string,
  start: string,
  end: string,
  slotDurationMinutes: number,
  capacityPerSlot: number,
): Activity {
  return {
    id,
    eventId,
    title,
    start,
    end,
    slotDurationMinutes,
    capacityPerSlot,
    slots: generateSlots(id, start, end, slotDurationMinutes, capacityPerSlot),
  }
}

function person(name: string, category: Person['category'], age: number | null): Person {
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

function seed(): Store {
  const now = Date.now()
  const day = 1000 * 60 * 60 * 24
  const eventDay = new Date(now + day * 20)
  eventDay.setHours(10, 0, 0, 0)
  const base = eventDay.getTime()

  const familyDayId = 'evt-family-day'
  const labId = `${familyDayId}-act-lab`
  const showId = `${familyDayId}-act-show`

  const labStart = new Date(base).toISOString()
  const labEnd = new Date(base + 1000 * 60 * 180).toISOString() // 3h → slot 30min
  const showStart = new Date(base + 1000 * 60 * 240).toISOString() // +4h
  const showEnd = new Date(base + 1000 * 60 * 360).toISOString() // +6h → slot 60min

  const familyDay: Event = {
    id: familyDayId,
    title: 'Family Day Aziendale 2026',
    description:
      'Una giornata dedicata ai dipendenti e alle loro famiglie con laboratori creativi e spettacoli dal vivo. Ogni attività ha posti limitati per fascia oraria.',
    location: 'Parco delle Cascine, Firenze',
    imageUrl: '/events/family-day.png',
    createdAt: new Date(now - day * 5).toISOString(),
    activityPolicy: 'free',
    minActivities: 0,
    allowOverlap: false,
    checkInToleranceMinutes: 15,
    allowChildren: true,
    maxChildrenPerRegistration: 4,
    allowCompanions: true,
    maxCompanionsPerRegistration: 2,
    activities: [
      buildActivity(familyDayId, labId, 'Laboratorio creativo', labStart, labEnd, 30, 10),
      buildActivity(familyDayId, showId, 'Spettacolo dal vivo', showStart, showEnd, 60, 40),
    ],
  }

  const summitId = 'evt-tech-summit'
  const talkId = `${summitId}-act-talk`
  const talkStart = new Date(base + day * 15).toISOString()
  const talkEnd = new Date(base + day * 15 + 1000 * 60 * 120).toISOString()

  const techSummit: Event = {
    id: summitId,
    title: 'Tech Summit Interno',
    description:
      'Conferenza tecnica interna con talk e sessioni di approfondimento sulle tecnologie adottate in azienda.',
    location: 'Auditorium HQ, Milano',
    imageUrl: '/events/tech-summit.png',
    createdAt: new Date(now - day * 2).toISOString(),
    activityPolicy: 'all',
    minActivities: 0,
    allowOverlap: true,
    checkInToleranceMinutes: 10,
    allowChildren: false,
    maxChildrenPerRegistration: 0,
    allowCompanions: false,
    maxCompanionsPerRegistration: 0,
    activities: [
      buildActivity(summitId, talkId, 'Keynote di apertura', talkStart, talkEnd, 120, 120),
    ],
  }

  const demoLab = familyDay.activities[0]
  const demoShow = familyDay.activities[1]
  const registrations: Registration[] = [
    {
      id: randomUUID(),
      eventId: familyDayId,
      contactEmail: 'giulia.rossi@azienda.it',
      selections: [
        { activityId: labId, slotId: demoLab.slots[0].id },
        { activityId: showId, slotId: demoShow.slots[0].id },
      ],
      persons: [
        person('Giulia Rossi', 'user', null),
        person('Marco Rossi', 'child', 6),
      ],
      createdAt: new Date(now - day).toISOString(),
    },
  ]

  return { events: [familyDay, techSummit], registrations }
}

function getStore(): Store {
  if (!globalForDb.__eventStore) {
    globalForDb.__eventStore = seed()
  }
  return globalForDb.__eventStore
}

export const db = {
  get events() {
    return getStore().events
  },
  get registrations() {
    return getStore().registrations
  },
}
