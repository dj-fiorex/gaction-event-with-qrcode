/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

function subjectFor(userId: Id<'users'>) {
  return `${userId}|test-session`
}

async function createAdmin(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    }),
  )
}

function buildEventInput(requireAccount: boolean) {
  return {
    title: 'Evento test',
    description: 'Descrizione abbastanza lunga',
    location: 'Roma',
    activityPolicy: 'free' as const,
    minActivities: 0,
    allowOverlap: false,
    checkInToleranceMinutes: 15,
    allowQrReuse: false,
    requireAccount,
    confirmParticipation: false,
    collectNames: true,
    collectAllergies: false,
    recordExit: false,
    allowChildren: false,
    maxChildrenPerRegistration: 0,
    allowCompanions: false,
    maxCompanionsPerRegistration: 0,
    checkInAccess: 'private' as const,
    checkInPassword: '',
    activities: [
      {
        title: 'Laboratorio',
        start: '2026-07-07T09:00',
        end: '2026-07-07T10:00',
        slotDurationMinutes: 60,
        capacityPerSlot: 10,
      },
    ],
  }
}

async function createStaff(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'staff@example.com',
      name: 'Staff',
      role: 'staff',
    }),
  )
}

async function createMember(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
      emailVerificationTime: Date.now(),
    }),
  )
}

test('events.create persists requireAccount and exposes it to public queries', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    buildEventInput(true),
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.requireAccount).toBe(true)
  expect(publicEvent?.requireAccount).toBe(true)
})

test('events.update can toggle requireAccount off', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    buildEventInput(true),
  )

  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.update, {
    eventId,
    ...buildEventInput(false),
  })

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.requireAccount).toBe(false)
  expect(publicEvent?.requireAccount).toBe(false)
})

/* ------------------------------------------------------------------ */
/* Raccolta nomi (issue #36)                                           */
/* ------------------------------------------------------------------ */

test('events.create persists collectNames=false (Raccolta nomi off) and exposes it', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    { ...buildEventInput(false), collectNames: false },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.collectNames).toBe(false)
  expect(publicEvent?.collectNames).toBe(false)
})

test('events.create defaults collectNames on, and existing events (no field) read as on', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    buildEventInput(false),
  )
  const publicEvent = await t.query(api.events.getPublic, { eventId })
  expect(publicEvent?.collectNames).toBe(true)

  // Legacy event inserted without the field defaults to on in the DTO.
  const legacyId = await t.run((ctx) =>
    ctx.db.insert('events', {
      title: 'Legacy',
      description: 'Descrizione',
      location: 'Roma',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
    }),
  )
  const legacyPublic = await t.query(api.events.getPublic, { eventId: legacyId })
  expect(legacyPublic?.collectNames).toBe(true)
})

/* ------------------------------------------------------------------ */
/* Allergie e intolleranze (issue #37)                                 */
/* ------------------------------------------------------------------ */

test('events.create persists collectAllergies=true and exposes it to public queries', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    { ...buildEventInput(false), collectAllergies: true },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.collectAllergies).toBe(true)
  expect(publicEvent?.collectAllergies).toBe(true)
})

test('events.create defaults collectAllergies off, and existing events (no field) read as off', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    buildEventInput(false),
  )
  const publicEvent = await t.query(api.events.getPublic, { eventId })
  expect(publicEvent?.collectAllergies).toBe(false)

  // Legacy event inserted without the field defaults to off in the DTO.
  const legacyId = await t.run((ctx) =>
    ctx.db.insert('events', {
      title: 'Legacy',
      description: 'Descrizione',
      location: 'Roma',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
    }),
  )
  const legacyPublic = await t.query(api.events.getPublic, { eventId: legacyId })
  expect(legacyPublic?.collectAllergies).toBe(false)
})

test('events.update can turn collectAllergies on for an existing event', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(api.events.create, buildEventInput(false))
  await asAdmin.mutation(api.events.update, {
    eventId,
    ...buildEventInput(false),
    collectAllergies: true,
  })

  const publicEvent = await t.query(api.events.getPublic, { eventId })
  expect(publicEvent?.collectAllergies).toBe(true)
})

/* ------------------------------------------------------------------ */
/* Regola del nucleo familiare (issue #35)                             */
/* ------------------------------------------------------------------ */

test('events.create persists maxCompanionsWithChildren when Figli and Ospiti are both enabled', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 1,
    },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.maxCompanionsWithChildren).toBe(1)
  expect(publicEvent?.maxCompanionsWithChildren).toBe(1)
})

test('events.create clears maxCompanionsWithChildren when Figli are not enabled, even if sent', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: false,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 1,
    },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  const publicEvent = await t.query(api.events.getPublic, { eventId })

  expect(rawEvent?.maxCompanionsWithChildren).toBeUndefined()
  expect(publicEvent?.maxCompanionsWithChildren).toBeNull()
})

test('events.create rejects a maxCompanionsWithChildren greater than the base Ospiti cap', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.create, {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 1,
      maxCompanionsWithChildren: 2,
    }),
  ).rejects.toThrow('Il massimo Ospiti con Figli non può superare il massimo Ospiti')
})

test('events.create allows a maxCompanionsWithChildren exactly equal to the base Ospiti cap (boundary)', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 2,
    },
  )

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  expect(rawEvent?.maxCompanionsWithChildren).toBe(2)
})

test('events.update clears a previously-set maxCompanionsWithChildren when Ospiti are disabled', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      allowChildren: true,
      maxChildrenPerRegistration: 5,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      maxCompanionsWithChildren: 1,
    },
  )

  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.update, {
    eventId,
    ...buildEventInput(false),
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    allowCompanions: false,
    maxCompanionsPerRegistration: 0,
    maxCompanionsWithChildren: 1,
  })

  const rawEvent = await t.run((ctx) => ctx.db.get(eventId))
  expect(rawEvent?.maxCompanionsWithChildren).toBeUndefined()
})

test('events.listOperable excludes members for password-mode events and includes staff', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const memberId = await createMember(t)

  const created = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      checkInAccess: 'password',
      checkInPassword: '123456',
    },
  )

  const memberOperable = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .query(api.events.listOperable, {})
  const staffOperable = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .query(api.events.listOperable, {})

  expect(memberOperable.map((event) => event.id)).not.toContain(created.id)
  expect(staffOperable.map((event) => event.id)).toContain(created.id)
})

test('checkins.operableEvents excludes members for password-mode events and includes staff', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const staffId = await createStaff(t)
  const memberId = await createMember(t)

  const created = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      checkInAccess: 'password',
      checkInPassword: '123456',
    },
  )

  const memberOperable = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .query(api.checkins.operableEvents, {})
  const staffOperable = await t
    .withIdentity({ subject: subjectFor(staffId) })
    .query(api.checkins.operableEvents, {})

  expect(memberOperable.map((event) => event.id)).not.toContain(created.id)
  expect(staffOperable.map((event) => event.id)).toContain(created.id)
})

/* ------------------------------------------------------------------ */
/* Date proprie dell'Evento (issue #45, ADR 0009)                      */
/* ------------------------------------------------------------------ */

test('a declared start wins over the one derived from the activities', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  // L'Evento comincia alle 20, la sua unica Attività alle 9: non è una
  // contraddizione da risolvere ma un fatto da rappresentare (ADR 0009).
  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    { ...buildEventInput(false), startsAt: '2026-07-07T20:00:00.000Z' },
  )

  const publicEvent = await t.query(api.events.getPublic, { eventId })
  expect(publicEvent?.startsAt).toBe('2026-07-07T20:00:00.000Z')
})

test('a declared end wins over the one derived from the activities', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      startsAt: '2026-07-07T20:00:00.000Z',
      endsAt: '2026-07-07T23:30:00.000Z',
    },
  )

  const publicEvent = await t.query(api.events.getPublic, { eventId })
  expect(publicEvent?.endsAt).toBe('2026-07-07T23:30:00.000Z')
})

test('an end without a start is rejected', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.create, {
      ...buildEventInput(false),
      endsAt: '2026-07-07T23:30:00.000Z',
    }),
  ).rejects.toThrow(/inizio/i)
})

test('an end earlier than or equal to the start is rejected', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  for (const endsAt of ['2026-07-07T19:00:00.000Z', '2026-07-07T20:00:00.000Z']) {
    await expect(
      t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.events.create, {
        ...buildEventInput(false),
        startsAt: '2026-07-07T20:00:00.000Z',
        endsAt,
      }),
    ).rejects.toThrow(/successiva/i)
  }
})

test('with no declared dates the behaviour is exactly today’s: derived from the activities', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      activities: [
        {
          title: 'Pomeriggio',
          start: '2026-07-07T14:00:00.000Z',
          end: '2026-07-07T15:00:00.000Z',
          slotDurationMinutes: 60,
          capacityPerSlot: 10,
        },
        {
          title: 'Mattina',
          start: '2026-07-07T09:00:00.000Z',
          end: '2026-07-07T10:00:00.000Z',
          slotDurationMinutes: 60,
          capacityPerSlot: 10,
        },
      ],
    },
  )

  const publicEvent = await t.query(api.events.getPublic, { eventId })
  // Il primo inizio e l'ultima fine, non quelli della prima Attività in elenco.
  expect(publicEvent?.startsAt).toBe('2026-07-07T09:00:00.000Z')
  expect(publicEvent?.endsAt).toBe('2026-07-07T15:00:00.000Z')
  expect(publicEvent?.declaredStartsAt).toBeNull()
  expect(publicEvent?.declaredEndsAt).toBeNull()
})

test('start and end resolve independently: a declared start leaves the end derived', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      startsAt: '2026-07-07T08:00:00.000Z',
      activities: [
        {
          title: 'Laboratorio',
          start: '2026-07-07T09:00:00.000Z',
          end: '2026-07-07T10:00:00.000Z',
          slotDurationMinutes: 60,
          capacityPerSlot: 10,
        },
      ],
    },
  )

  const publicEvent = await t.query(api.events.getPublic, { eventId })
  expect(publicEvent?.startsAt).toBe('2026-07-07T08:00:00.000Z')
  expect(publicEvent?.endsAt).toBe('2026-07-07T10:00:00.000Z')
  expect(publicEvent?.declaredEndsAt).toBeNull()
})

test('with neither declared dates nor activities there is no date at all', async () => {
  const t = convexTest(schema, modules)

  const eventId = await t.run((ctx) =>
    ctx.db.insert('events', {
      title: 'Assemblea',
      description: 'Descrizione',
      location: 'Roma',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: false,
      maxChildrenPerRegistration: 0,
      allowCompanions: false,
      maxCompanionsPerRegistration: 0,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
    }),
  )

  const publicEvent = await t.query(api.events.getPublic, { eventId })
  // `null` è ciò che ogni superficie rende come «Data da definire».
  expect(publicEvent?.startsAt).toBeNull()
  expect(publicEvent?.endsAt).toBeNull()
})

test('events.update can declare dates and can take them away again', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const pinned = {
    ...buildEventInput(false),
    activities: [
      {
        title: 'Laboratorio',
        start: '2026-07-07T09:00:00.000Z',
        end: '2026-07-07T10:00:00.000Z',
        slotDurationMinutes: 60,
        capacityPerSlot: 10,
      },
    ],
  }
  const { id: eventId } = await asAdmin.mutation(api.events.create, pinned)

  await asAdmin.mutation(api.events.update, {
    eventId,
    ...pinned,
    startsAt: '2026-07-07T20:00:00.000Z',
    endsAt: '2026-07-07T23:00:00.000Z',
  })
  const declared = await t.query(api.events.getPublic, { eventId })
  expect(declared?.startsAt).toBe('2026-07-07T20:00:00.000Z')
  expect(declared?.endsAt).toBe('2026-07-07T23:00:00.000Z')

  // Campi svuotati nel form: la dichiarazione sparisce e torna la derivazione.
  await asAdmin.mutation(api.events.update, {
    eventId,
    ...pinned,
    startsAt: '',
    endsAt: '',
  })
  const derived = await t.query(api.events.getPublic, { eventId })
  expect(derived?.declaredStartsAt).toBeNull()
  expect(derived?.startsAt).toBe('2026-07-07T09:00:00.000Z')
  expect(derived?.endsAt).toBe('2026-07-07T10:00:00.000Z')
})

test('events.listPublic orders by the declared date, not by the derived one', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  // Deriverebbe le 08:00 e verrebbe prima, ma dichiara di cominciare alle 20.
  const { id: dinnerId } = await asAdmin.mutation(api.events.create, {
    ...buildEventInput(false),
    title: 'Cena',
    startsAt: '2026-07-07T20:00:00.000Z',
    activities: [
      {
        title: 'Aperitivo',
        start: '2026-07-07T08:00:00.000Z',
        end: '2026-07-07T09:00:00.000Z',
        slotDurationMinutes: 60,
        capacityPerSlot: 10,
      },
    ],
  })
  const { id: morningId } = await asAdmin.mutation(api.events.create, {
    ...buildEventInput(false),
    title: 'Open day',
  })

  const listed = await t.query(api.events.listPublic, {})
  expect(listed.map((event) => event.id)).toEqual([morningId, dinnerId])
})

test('a derived end that would precede the declared start is dropped, not printed backwards', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)

  // Cena alle 20 con un allestimento pomeridiano fra le Attività: la fine
  // derivata cadrebbe *prima* dell'inizio dichiarato, e «20:00 – 15:00» sul
  // biglietto è peggio di nessun orario di fine. La dichiarazione dell'inizio
  // resta, la derivazione della fine si tace (ADR 0009): meglio nessun orario
  // che uno inventato — o, qui, uno impossibile.
  const { id: eventId } = await t.withIdentity({ subject: subjectFor(adminId) }).mutation(
    api.events.create,
    {
      ...buildEventInput(false),
      startsAt: '2026-07-07T20:00:00.000Z',
      activities: [
        {
          title: 'Allestimento',
          start: '2026-07-07T14:00:00.000Z',
          end: '2026-07-07T15:00:00.000Z',
          slotDurationMinutes: 60,
          capacityPerSlot: 10,
        },
      ],
    },
  )

  const publicEvent = await t.query(api.events.getPublic, { eventId })
  expect(publicEvent?.startsAt).toBe('2026-07-07T20:00:00.000Z')
  expect(publicEvent?.endsAt).toBeNull()
  // La dichiarazione resta intatta in tabella: a tacere è solo la lettura.
  expect(publicEvent?.declaredStartsAt).toBe('2026-07-07T20:00:00.000Z')
})

test('embedShowTitle/embedShowLocation: assenti si vedono, setEmbedSettings li spegne', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(api.events.create, buildEventInput(false))

  // Nessun backfill: `create` non scrive i due campi, e l'Evento deve comunque
  // mostrare l'intestazione. È l'unico modo in cui questa impostazione può far
  // danno — un default sbagliato spegnerebbe l'intestazione a ogni Evento già
  // pubblicato, senza che nessuno abbia toccato nulla.
  const raw = await t.run((ctx) => ctx.db.get(eventId))
  expect(raw?.embedShowTitle).toBeUndefined()
  expect(raw?.embedShowLocation).toBeUndefined()

  const before = await t.query(api.events.getPublic, { eventId })
  expect(before?.embedShowTitle).toBe(true)
  expect(before?.embedShowLocation).toBe(true)

  await asAdmin.mutation(api.events.setEmbedSettings, {
    eventId,
    embedEnabled: true,
    allowedOrigins: ['https://www.partner.com'],
    embedShowTitle: false,
    embedShowLocation: false,
    embedShowTickets: true,
    embedShowNewRegistration: true,
    // L'Aspetto è sempre presente e mai facoltativo (ADR 0013): `null` dice
    // «nessun Aspetto», che è ciò che questo test vuole.
    embedTheme: null,
  })

  // Pubblici a differenza di `allowedOrigins`: è l'embed a leggerli, e l'embed
  // interroga `getPublic`.
  const after = await t.query(api.events.getPublic, { eventId })
  expect(after?.embedShowTitle).toBe(false)
  expect(after?.embedShowLocation).toBe(false)
})

test('Esito della Prenotazione: i testi sono pubblici e ripiegano campo per campo', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(api.events.create, buildEventInput(false))

  // Nessun backfill: `create` senza i tre campi non li scrive affatto.
  const raw = await t.run((ctx) => ctx.db.get(eventId))
  expect(raw?.resultTitle).toBeUndefined()
  expect(raw?.resultBody).toBeUndefined()
  expect(raw?.resultClosing).toBeUndefined()

  const before = await t.query(api.events.getPublic, { eventId })
  expect(before?.resultTitle).toBe('')
  expect(before?.resultClosing).toBe('')

  await asAdmin.mutation(api.events.update, {
    eventId,
    ...buildEventInput(false),
    resultTitle: 'Registrazione completata!',
    // Solo due dei tre: il ripiego è indipendente per campo, e il corpo deve
    // restare quello odierno senza che l'admin lo ricopi a mano.
    resultClosing: 'Ti aspettiamo il 26 settembre alle 15.00.',
  })

  // Pubblici, a differenza di emailSubject/emailBody: li rende il form a
  // chiunque prenoti, quindi `getPublic` — non solo `getForAdmin` — li porta.
  const after = await t.query(api.events.getPublic, { eventId })
  expect(after?.resultTitle).toBe('Registrazione completata!')
  expect(after?.resultBody).toBe('')
  expect(after?.resultClosing).toBe('Ti aspettiamo il 26 settembre alle 15.00.')

  // Uno spazio non è un testo: svuotare il campo deve tornare al ripiego, non
  // persistere una stringa che sembra scritta.
  await asAdmin.mutation(api.events.update, {
    eventId,
    ...buildEventInput(false),
    resultTitle: '   ',
  })
  const cleared = await t.run((ctx) => ctx.db.get(eventId))
  expect(cleared?.resultTitle).toBeUndefined()
})

test('embedShowTickets/embedShowNewRegistration: assenti si vedono, setEmbedSettings li spegne', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createAdmin(t)
  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })

  const { id: eventId } = await asAdmin.mutation(api.events.create, buildEventInput(false))

  const raw = await t.run((ctx) => ctx.db.get(eventId))
  expect(raw?.embedShowTickets).toBeUndefined()
  expect(raw?.embedShowNewRegistration).toBeUndefined()

  const before = await t.query(api.events.getPublic, { eventId })
  expect(before?.embedShowTickets).toBe(true)
  expect(before?.embedShowNewRegistration).toBe(true)

  await asAdmin.mutation(api.events.setEmbedSettings, {
    eventId,
    embedEnabled: true,
    allowedOrigins: ['https://www.partner.com'],
    embedShowTitle: true,
    embedShowLocation: true,
    embedShowTickets: false,
    embedShowNewRegistration: false,
    embedTheme: null,
  })

  const after = await t.query(api.events.getPublic, { eventId })
  expect(after?.embedShowTickets).toBe(false)
  expect(after?.embedShowNewRegistration).toBe(false)
  // I due interruttori dell'Incorporamento non toccano l'intestazione, che è
  // una coppia distinta: spegnerli non deve spegnere altro.
  expect(after?.embedShowTitle).toBe(true)
  expect(after?.embedShowLocation).toBe(true)
})
