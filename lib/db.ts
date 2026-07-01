import { randomUUID } from 'crypto'
import type { Event, Registration } from './types'

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

function seed(): Store {
  const now = Date.now()
  const day = 1000 * 60 * 60 * 24

  const events: Event[] = [
    {
      id: 'evt-family-day',
      title: 'Family Day Aziendale 2026',
      description:
        'Una giornata dedicata ai dipendenti e alle loro famiglie con attività per grandi e piccini, laboratori creativi, food truck e spettacoli dal vivo. Un momento di condivisione per rafforzare lo spirito di squadra fuori dall\u2019ufficio.',
      date: new Date(now + day * 20).toISOString(),
      location: 'Parco delle Cascine, Firenze',
      capacity: 200,
      imageUrl: '/events/family-day.png',
      childOptions: { allowChildren: true, maxChildrenPerRegistration: 4 },
      createdAt: new Date(now - day * 5).toISOString(),
    },
    {
      id: 'evt-tech-summit',
      title: 'Tech Summit Interno',
      description:
        'Conferenza tecnica interna con talk, sessioni di approfondimento e workshop pratici sulle tecnologie adottate in azienda. Networking e confronto tra i team di prodotto e ingegneria.',
      date: new Date(now + day * 35).toISOString(),
      location: 'Auditorium HQ, Milano',
      capacity: 120,
      imageUrl: '/events/tech-summit.png',
      childOptions: { allowChildren: false, maxChildrenPerRegistration: 0 },
      createdAt: new Date(now - day * 2).toISOString(),
    },
  ]

  const registrations: Registration[] = [
    {
      id: randomUUID(),
      eventId: 'evt-family-day',
      employeeName: 'Giulia Rossi',
      employeeEmail: 'giulia.rossi@azienda.it',
      department: 'Marketing',
      children: [{ name: 'Marco', age: 6 }],
      ticketCode: 'TCK-DEMO-0001',
      used: false,
      usedAt: null,
      createdAt: new Date(now - day).toISOString(),
    },
  ]

  return { events, registrations }
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
