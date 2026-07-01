import { randomUUID } from 'crypto'
import { hashCheckInPassword } from './auth'
import { generateSlots } from './slots'
import { generateScanToken, generateTicketCode } from './qr'
import type { Activity, Event, Person, Registration } from './types'

/**
 * Seed di mock data per il database in memoria.
 *
 * Copre una matrice esaustiva di combinazioni:
 * - Eventi: tutte le activityPolicy (free/all/min), allowOverlap on/off,
 *   allowQrReuse on/off, bambini e accompagnatori consentiti o meno (con
 *   diversi limiti), accesso al check-in privato o con password.
 * - Prenotazioni: ogni combinazione di Persone (solo Utente, +bambini,
 *   +accompagnatori, fino ai limiti massimi) su eventi che le consentono.
 * - Stati di check-in: nessuno, solo ingresso Evento, ingresso + Attività,
 *   e ingressi ripetuti (count > 1) sugli eventi con allowQrReuse.
 */

export interface SeedStore {
  events: Event[]
  registrations: Registration[]
}

/* ------------------------------------------------------------------ */
/* Helper di costruzione                                               */
/* ------------------------------------------------------------------ */

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

/** Id di uno Slot generato da generateSlots, per indice. */
function slotId(activityId: string, index: number): string {
  return `${activityId}-s${index}`
}

function makePerson(name: string, category: Person['category'], age: number | null): Person {
  return {
    id: randomUUID(),
    name,
    category,
    age,
    ticketCode: generateTicketCode(),
    eventCheckInAt: null,
    eventCheckInCount: 0,
    eventCheckInLastAt: null,
    activityCheckIns: [],
  }
}

interface CheckInSpec {
  /** Ingresso all'Evento. count default 1, lastAt default = at. */
  event?: { at: string; count?: number; lastAt?: string }
  /** Check-in su una o più Attività/Slot. count default 1, lastAt default = at. */
  activities?: Array<{
    activityId: string
    slotId: string
    at: string
    count?: number
    lastAt?: string
  }>
}

/** Applica uno stato di check-in a una Persona restituendo una nuova copia. */
function applyCheckIn(p: Person, spec: CheckInSpec): Person {
  const next: Person = { ...p, activityCheckIns: [...p.activityCheckIns] }
  if (spec.event) {
    next.eventCheckInAt = spec.event.at
    next.eventCheckInCount = spec.event.count ?? 1
    next.eventCheckInLastAt = spec.event.lastAt ?? spec.event.at
  }
  if (spec.activities) {
    next.activityCheckIns = spec.activities.map((a) => ({
      activityId: a.activityId,
      slotId: a.slotId,
      at: a.at,
      count: a.count ?? 1,
      lastAt: a.lastAt ?? a.at,
    }))
  }
  return next
}

/* ------------------------------------------------------------------ */
/* Riferimenti temporali                                               */
/* ------------------------------------------------------------------ */

const now = Date.now()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** ISO relativo a "adesso". */
const at = (offsetMs: number): string => new Date(now + offsetMs).toISOString()

/* ------------------------------------------------------------------ */
/* Definizione degli Eventi (matrice di configurazioni)                */
/* ------------------------------------------------------------------ */

/**
 * Evento 1 — Family Day.
 * policy free, no overlap, no QR reuse, bambini (max 4) + accompagnatori (max 2),
 * accesso privato.
 */
const familyDayId = 'evt-family-day'
const fdLabId = `${familyDayId}-act-lab`
const fdShowId = `${familyDayId}-act-show`
const fdBase = now + DAY * 20

const familyDay: Event = {
  id: familyDayId,
  title: 'Family Day Aziendale 2026',
  description:
    'Una giornata dedicata ai dipendenti e alle loro famiglie con laboratori creativi e spettacoli dal vivo. Ogni attività ha posti limitati per fascia oraria.',
  location: 'Parco delle Cascine, Firenze',
  imageUrl: '/events/family-day.png',
  createdAt: at(-DAY * 5),
  activityPolicy: 'free',
  minActivities: 0,
  allowOverlap: false,
  checkInToleranceMinutes: 15,
  allowQrReuse: false,
  allowChildren: true,
  maxChildrenPerRegistration: 4,
  allowCompanions: true,
  maxCompanionsPerRegistration: 2,
  checkInAccess: 'private',
  scanToken: generateScanToken(),
  checkInPasswordHash: null,
  activities: [
    buildActivity(familyDayId, fdLabId, 'Laboratorio creativo', at(DAY * 20), at(fdBase + 180 * MIN - now), 30, 10),
    buildActivity(familyDayId, fdShowId, 'Spettacolo dal vivo', at(fdBase + 240 * MIN - now), at(fdBase + 360 * MIN - now), 60, 40),
  ],
}

/**
 * Evento 2 — Tech Summit.
 * policy all, overlap consentito, QR reuse attivo, niente bambini/accompagnatori,
 * accesso con password.
 */
const summitId = 'evt-tech-summit'
const tsKeynoteId = `${summitId}-act-keynote`
const tsWorkshopId = `${summitId}-act-workshop`
const tsBase = now + DAY * 35

const techSummit: Event = {
  id: summitId,
  title: 'Tech Summit Interno',
  description:
    'Conferenza tecnica interna con talk e sessioni di approfondimento sulle tecnologie adottate in azienda.',
  location: 'Auditorium HQ, Milano',
  imageUrl: '/events/tech-summit.png',
  createdAt: at(-DAY * 2),
  activityPolicy: 'all',
  minActivities: 0,
  allowOverlap: true,
  checkInToleranceMinutes: 10,
  allowQrReuse: true,
  allowChildren: false,
  maxChildrenPerRegistration: 0,
  allowCompanions: false,
  maxCompanionsPerRegistration: 0,
  checkInAccess: 'password',
  scanToken: generateScanToken(),
  checkInPasswordHash: hashCheckInPassword('summit2026'),
  activities: [
    buildActivity(summitId, tsKeynoteId, 'Keynote di apertura', at(tsBase - now), at(tsBase + 120 * MIN - now), 120, 120),
    buildActivity(summitId, tsWorkshopId, 'Workshop pratico', at(tsBase + 180 * MIN - now), at(tsBase + 300 * MIN - now), 60, 30),
  ],
}

/**
 * Evento 3 — Workshop Day.
 * policy min (min 2 attività), no overlap, no QR reuse, bambini (max 2) ma niente
 * accompagnatori, accesso privato.
 */
const workshopId = 'evt-workshop-day'
const wdAId = `${workshopId}-act-a`
const wdBId = `${workshopId}-act-b`
const wdCId = `${workshopId}-act-c`
const wdBase = now + DAY * 12

const workshopDay: Event = {
  id: workshopId,
  title: 'Workshop Day Formazione',
  description:
    'Giornata di formazione con più laboratori paralleli. È richiesta la partecipazione ad almeno due workshop.',
  location: 'Campus Formazione, Bologna',
  imageUrl: '/events/family-day.png',
  createdAt: at(-DAY * 3),
  activityPolicy: 'min',
  minActivities: 2,
  allowOverlap: false,
  checkInToleranceMinutes: 20,
  allowQrReuse: false,
  allowChildren: true,
  maxChildrenPerRegistration: 2,
  allowCompanions: false,
  maxCompanionsPerRegistration: 0,
  checkInAccess: 'private',
  scanToken: generateScanToken(),
  checkInPasswordHash: null,
  activities: [
    buildActivity(workshopId, wdAId, 'Workshop A · Design', at(wdBase - now), at(wdBase + 120 * MIN - now), 60, 15),
    buildActivity(workshopId, wdBId, 'Workshop B · Sviluppo', at(wdBase + 150 * MIN - now), at(wdBase + 270 * MIN - now), 60, 15),
    buildActivity(workshopId, wdCId, 'Workshop C · Prodotto', at(wdBase + 330 * MIN - now), at(wdBase + 450 * MIN - now), 60, 15),
  ],
}

/**
 * Evento 4 — Gala Dinner.
 * policy free, overlap consentito, QR reuse attivo, niente bambini ma
 * accompagnatori (max 3), accesso con password.
 */
const galaId = 'evt-gala-dinner'
const gaDinnerId = `${galaId}-act-dinner`
const gaConcertId = `${galaId}-act-concert`
const gaBase = now + DAY * 25

const galaDinner: Event = {
  id: galaId,
  title: 'Gala Dinner Annuale',
  description:
    'Serata di gala con cena e concerto dal vivo. Riservata ai dipendenti e ai loro accompagnatori adulti.',
  location: 'Villa Reale, Monza',
  imageUrl: '/events/tech-summit.png',
  createdAt: at(-DAY * 6),
  activityPolicy: 'free',
  minActivities: 0,
  allowOverlap: true,
  checkInToleranceMinutes: 30,
  allowQrReuse: true,
  allowChildren: false,
  maxChildrenPerRegistration: 0,
  allowCompanions: true,
  maxCompanionsPerRegistration: 3,
  checkInAccess: 'password',
  scanToken: generateScanToken(),
  checkInPasswordHash: hashCheckInPassword('gala2026'),
  activities: [
    buildActivity(galaId, gaDinnerId, 'Cena di gala', at(gaBase - now), at(gaBase + 120 * MIN - now), 120, 200),
    buildActivity(galaId, gaConcertId, 'Concerto dal vivo', at(gaBase + 120 * MIN - now), at(gaBase + 240 * MIN - now), 120, 200),
  ],
}

/**
 * Evento 5 — Sports Day.
 * policy all, no overlap, no QR reuse, bambini (max 4) + accompagnatori (max 2),
 * accesso con password.
 */
const sportsId = 'evt-sports-day'
const spRaceId = `${sportsId}-act-race`
const spGamesId = `${sportsId}-act-games`
const spBase = now + DAY * 18

const sportsDay: Event = {
  id: sportsId,
  title: 'Sports Day in Famiglia',
  description:
    'Giornata sportiva aperta a dipendenti, bambini e accompagnatori con gara podistica e giochi di squadra.',
  location: 'Centro Sportivo, Torino',
  imageUrl: '/events/family-day.png',
  createdAt: at(-DAY * 1),
  activityPolicy: 'all',
  minActivities: 0,
  allowOverlap: false,
  checkInToleranceMinutes: 15,
  allowQrReuse: false,
  allowChildren: true,
  maxChildrenPerRegistration: 4,
  allowCompanions: true,
  maxCompanionsPerRegistration: 2,
  checkInAccess: 'password',
  scanToken: generateScanToken(),
  checkInPasswordHash: hashCheckInPassword('sport2026'),
  activities: [
    buildActivity(sportsId, spRaceId, 'Gara podistica', at(spBase - now), at(spBase + 90 * MIN - now), 45, 50),
    buildActivity(sportsId, spGamesId, 'Giochi di squadra', at(spBase + 120 * MIN - now), at(spBase + 210 * MIN - now), 45, 50),
  ],
}

/* ------------------------------------------------------------------ */
/* Prenotazioni (matrice di combinazioni di Persone + stati check-in)  */
/* ------------------------------------------------------------------ */

function registration(
  eventId: string,
  contactEmail: string,
  selections: Registration['selections'],
  persons: Person[],
  createdOffsetMs: number,
): Registration {
  return {
    id: randomUUID(),
    eventId,
    contactEmail,
    selections,
    persons,
    createdAt: at(createdOffsetMs),
  }
}

const registrations: Registration[] = [
  /* --- Family Day: bambini + accompagnatori, accesso privato --- */

  // Solo Utente, nessun check-in.
  registration(
    familyDayId,
    'solo.user.fd@azienda.it',
    [{ activityId: fdLabId, slotId: slotId(fdLabId, 0) }],
    [makePerson('Solo User FD', 'user', null)],
    -DAY * 4,
  ),

  // Utente + 1 bambino. Ingresso Evento per entrambi, check-in Laboratorio.
  registration(
    familyDayId,
    'user1child.fd@azienda.it',
    [
      { activityId: fdLabId, slotId: slotId(fdLabId, 1) },
      { activityId: fdShowId, slotId: slotId(fdShowId, 0) },
    ],
    [
      applyCheckIn(makePerson('User+1Child FD', 'user', null), {
        event: { at: at(-HOUR * 3) },
        activities: [{ activityId: fdLabId, slotId: slotId(fdLabId, 1), at: at(-HOUR * 2) }],
      }),
      applyCheckIn(makePerson('Child A · User+1Child FD', 'child', 6), {
        event: { at: at(-HOUR * 3) },
        activities: [{ activityId: fdLabId, slotId: slotId(fdLabId, 1), at: at(-HOUR * 2) }],
      }),
    ],
    -DAY * 4,
  ),

  // Utente + 2 bambini. Tutti con ingresso Evento e check-in Laboratorio.
  registration(
    familyDayId,
    'user2child.fd@azienda.it',
    [{ activityId: fdLabId, slotId: slotId(fdLabId, 2) }],
    [
      applyCheckIn(makePerson('User+2Child FD', 'user', null), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: fdLabId, slotId: slotId(fdLabId, 2), at: at(-HOUR) }],
      }),
      applyCheckIn(makePerson('Child A · User+2Child FD', 'child', 8), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: fdLabId, slotId: slotId(fdLabId, 2), at: at(-HOUR) }],
      }),
      applyCheckIn(makePerson('Child B · User+2Child FD', 'child', 5), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: fdLabId, slotId: slotId(fdLabId, 2), at: at(-HOUR) }],
      }),
    ],
    -DAY * 3,
  ),

  // Utente + 4 bambini (max). Solo l'Utente ha fatto l'ingresso Evento.
  registration(
    familyDayId,
    'user4child.fd@azienda.it',
    [{ activityId: fdShowId, slotId: slotId(fdShowId, 1) }],
    [
      applyCheckIn(makePerson('User+4Child FD', 'user', null), {
        event: { at: at(-HOUR) },
      }),
      makePerson('Child A · User+4Child FD', 'child', 4),
      makePerson('Child B · User+4Child FD', 'child', 7),
      makePerson('Child C · User+4Child FD', 'child', 9),
      makePerson('Child D · User+4Child FD', 'child', 11),
    ],
    -DAY * 3,
  ),

  // Utente + 1 accompagnatore, nessun check-in.
  registration(
    familyDayId,
    'user1comp.fd@azienda.it',
    [{ activityId: fdLabId, slotId: slotId(fdLabId, 3) }],
    [
      makePerson('User+1Comp FD', 'user', null),
      makePerson('Companion A · User+1Comp FD', 'companion', null),
    ],
    -DAY * 2,
  ),

  // Utente + 2 accompagnatori (max). Tutti con ingresso Evento.
  registration(
    familyDayId,
    'user2comp.fd@azienda.it',
    [{ activityId: fdLabId, slotId: slotId(fdLabId, 4) }],
    [
      applyCheckIn(makePerson('User+2Comp FD', 'user', null), { event: { at: at(-HOUR * 2) } }),
      applyCheckIn(makePerson('Companion A · User+2Comp FD', 'companion', null), { event: { at: at(-HOUR * 2) } }),
      applyCheckIn(makePerson('Companion B · User+2Comp FD', 'companion', null), { event: { at: at(-HOUR * 2) } }),
    ],
    -DAY * 2,
  ),

  // Utente + 2 bambini + 1 accompagnatore. Stato misto: Utente e accompagnatore
  // hanno il check-in Attività, i bambini solo l'ingresso Evento.
  registration(
    familyDayId,
    'user2child1comp.fd@azienda.it',
    [
      { activityId: fdLabId, slotId: slotId(fdLabId, 5) },
      { activityId: fdShowId, slotId: slotId(fdShowId, 0) },
    ],
    [
      applyCheckIn(makePerson('User+2Child+1Comp FD', 'user', null), {
        event: { at: at(-HOUR * 3) },
        activities: [{ activityId: fdLabId, slotId: slotId(fdLabId, 5), at: at(-HOUR * 2) }],
      }),
      applyCheckIn(makePerson('Child A · User+2Child+1Comp FD', 'child', 6), { event: { at: at(-HOUR * 3) } }),
      applyCheckIn(makePerson('Child B · User+2Child+1Comp FD', 'child', 10), { event: { at: at(-HOUR * 3) } }),
      applyCheckIn(makePerson('Companion A · User+2Child+1Comp FD', 'companion', null), {
        event: { at: at(-HOUR * 3) },
        activities: [{ activityId: fdLabId, slotId: slotId(fdLabId, 5), at: at(-HOUR * 2) }],
      }),
    ],
    -DAY * 2,
  ),

  // Utente + 4 bambini + 2 accompagnatori (combinazione massima). Tutti con
  // ingresso Evento, nessun check-in Attività.
  registration(
    familyDayId,
    'full.fd@azienda.it',
    [{ activityId: fdShowId, slotId: slotId(fdShowId, 0) }],
    [
      applyCheckIn(makePerson('User+4Child+2Comp FD', 'user', null), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Child A · Full FD', 'child', 3), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Child B · Full FD', 'child', 6), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Child C · Full FD', 'child', 9), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Child D · Full FD', 'child', 12), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Companion A · Full FD', 'companion', null), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Companion B · Full FD', 'companion', null), { event: { at: at(-HOUR) } }),
    ],
    -DAY,
  ),

  /* --- Tech Summit: solo Utente, QR reuse, password --- */

  // Solo Utente, nessun check-in.
  registration(
    summitId,
    'solo.user.ts@azienda.it',
    [
      { activityId: tsKeynoteId, slotId: slotId(tsKeynoteId, 0) },
      { activityId: tsWorkshopId, slotId: slotId(tsWorkshopId, 0) },
    ],
    [makePerson('Solo User TS', 'user', null)],
    -DAY * 2,
  ),

  // Solo Utente con ingressi ripetuti (QR reuse): 3 ingressi Evento e 2
  // scansioni sul Keynote.
  registration(
    summitId,
    'reuse.user.ts@azienda.it',
    [
      { activityId: tsKeynoteId, slotId: slotId(tsKeynoteId, 0) },
      { activityId: tsWorkshopId, slotId: slotId(tsWorkshopId, 0) },
    ],
    [
      applyCheckIn(makePerson('Reuse User TS', 'user', null), {
        event: { at: at(-HOUR * 5), count: 3, lastAt: at(-HOUR) },
        activities: [
          { activityId: tsKeynoteId, slotId: slotId(tsKeynoteId, 0), at: at(-HOUR * 4), count: 2, lastAt: at(-HOUR * 2) },
        ],
      }),
    ],
    -DAY,
  ),

  /* --- Workshop Day: bambini (max 2), policy min 2, privato --- */

  // Solo Utente su due workshop (soddisfa il minimo), nessun check-in.
  registration(
    workshopId,
    'solo.user.wd@azienda.it',
    [
      { activityId: wdAId, slotId: slotId(wdAId, 0) },
      { activityId: wdBId, slotId: slotId(wdBId, 0) },
    ],
    [makePerson('Solo User WD', 'user', null)],
    -DAY * 2,
  ),

  // Utente + 1 bambino su due workshop, con ingresso Evento e check-in Workshop A.
  registration(
    workshopId,
    'user1child.wd@azienda.it',
    [
      { activityId: wdAId, slotId: slotId(wdAId, 0) },
      { activityId: wdCId, slotId: slotId(wdCId, 0) },
    ],
    [
      applyCheckIn(makePerson('User+1Child WD', 'user', null), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: wdAId, slotId: slotId(wdAId, 0), at: at(-HOUR) }],
      }),
      applyCheckIn(makePerson('Child A · User+1Child WD', 'child', 7), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: wdAId, slotId: slotId(wdAId, 0), at: at(-HOUR) }],
      }),
    ],
    -DAY,
  ),

  // Utente + 2 bambini (max) su due workshop, tutti con ingresso Evento.
  registration(
    workshopId,
    'user2child.wd@azienda.it',
    [
      { activityId: wdBId, slotId: slotId(wdBId, 1) },
      { activityId: wdCId, slotId: slotId(wdCId, 1) },
    ],
    [
      applyCheckIn(makePerson('User+2Child WD', 'user', null), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Child A · User+2Child WD', 'child', 8), { event: { at: at(-HOUR) } }),
      applyCheckIn(makePerson('Child B · User+2Child WD', 'child', 10), { event: { at: at(-HOUR) } }),
    ],
    -DAY,
  ),

  /* --- Gala Dinner: accompagnatori (max 3), QR reuse, password --- */

  // Solo Utente su cena + concerto, nessun check-in.
  registration(
    galaId,
    'solo.user.gd@azienda.it',
    [
      { activityId: gaDinnerId, slotId: slotId(gaDinnerId, 0) },
      { activityId: gaConcertId, slotId: slotId(gaConcertId, 0) },
    ],
    [makePerson('Solo User GD', 'user', null)],
    -DAY * 3,
  ),

  // Utente + 3 accompagnatori (max) con ingressi ripetuti (QR reuse) su cena.
  registration(
    galaId,
    'user3comp.gd@azienda.it',
    [
      { activityId: gaDinnerId, slotId: slotId(gaDinnerId, 0) },
      { activityId: gaConcertId, slotId: slotId(gaConcertId, 0) },
    ],
    [
      applyCheckIn(makePerson('User+3Comp GD', 'user', null), {
        event: { at: at(-HOUR * 4), count: 2, lastAt: at(-HOUR * 2) },
        activities: [{ activityId: gaDinnerId, slotId: slotId(gaDinnerId, 0), at: at(-HOUR * 3), count: 2, lastAt: at(-HOUR) }],
      }),
      applyCheckIn(makePerson('Companion A · User+3Comp GD', 'companion', null), { event: { at: at(-HOUR * 4) } }),
      applyCheckIn(makePerson('Companion B · User+3Comp GD', 'companion', null), { event: { at: at(-HOUR * 4) } }),
      makePerson('Companion C · User+3Comp GD', 'companion', null),
    ],
    -DAY * 2,
  ),

  /* --- Sports Day: bambini (max 4) + accompagnatori (max 2), password --- */

  // Utente + 1 bambino + 1 accompagnatore, ingresso Evento + check-in gara.
  registration(
    sportsId,
    'user1child1comp.sd@azienda.it',
    [
      { activityId: spRaceId, slotId: slotId(spRaceId, 0) },
      { activityId: spGamesId, slotId: slotId(spGamesId, 0) },
    ],
    [
      applyCheckIn(makePerson('User+1Child+1Comp SD', 'user', null), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: spRaceId, slotId: slotId(spRaceId, 0), at: at(-HOUR) }],
      }),
      applyCheckIn(makePerson('Child A · User+1Child+1Comp SD', 'child', 9), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: spRaceId, slotId: slotId(spRaceId, 0), at: at(-HOUR) }],
      }),
      applyCheckIn(makePerson('Companion A · User+1Child+1Comp SD', 'companion', null), {
        event: { at: at(-HOUR * 2) },
        activities: [{ activityId: spRaceId, slotId: slotId(spRaceId, 0), at: at(-HOUR) }],
      }),
    ],
    -DAY,
  ),

  // Utente + 4 bambini + 2 accompagnatori (combinazione massima), tutti con
  // ingresso Evento e check-in gara + giochi.
  registration(
    sportsId,
    'full.sd@azienda.it',
    [
      { activityId: spRaceId, slotId: slotId(spRaceId, 1) },
      { activityId: spGamesId, slotId: slotId(spGamesId, 1) },
    ],
    [
      applyCheckIn(makePerson('User+4Child+2Comp SD', 'user', null), {
        event: { at: at(-HOUR * 3) },
        activities: [
          { activityId: spRaceId, slotId: slotId(spRaceId, 1), at: at(-HOUR * 2) },
          { activityId: spGamesId, slotId: slotId(spGamesId, 1), at: at(-HOUR) },
        ],
      }),
      applyCheckIn(makePerson('Child A · Full SD', 'child', 4), {
        event: { at: at(-HOUR * 3) },
        activities: [{ activityId: spRaceId, slotId: slotId(spRaceId, 1), at: at(-HOUR * 2) }],
      }),
      applyCheckIn(makePerson('Child B · Full SD', 'child', 6), {
        event: { at: at(-HOUR * 3) },
        activities: [{ activityId: spRaceId, slotId: slotId(spRaceId, 1), at: at(-HOUR * 2) }],
      }),
      applyCheckIn(makePerson('Child C · Full SD', 'child', 8), { event: { at: at(-HOUR * 3) } }),
      applyCheckIn(makePerson('Child D · Full SD', 'child', 10), { event: { at: at(-HOUR * 3) } }),
      applyCheckIn(makePerson('Companion A · Full SD', 'companion', null), {
        event: { at: at(-HOUR * 3) },
        activities: [
          { activityId: spRaceId, slotId: slotId(spRaceId, 1), at: at(-HOUR * 2) },
          { activityId: spGamesId, slotId: slotId(spGamesId, 1), at: at(-HOUR) },
        ],
      }),
      applyCheckIn(makePerson('Companion B · Full SD', 'companion', null), { event: { at: at(-HOUR * 3) } }),
    ],
    -HOUR * 6,
  ),
]

/** Costruisce lo stato iniziale del database in memoria. */
export function seed(): SeedStore {
  return {
    events: [familyDay, techSummit, workshopDay, galaDinner, sportsDay],
    registrations,
  }
}
