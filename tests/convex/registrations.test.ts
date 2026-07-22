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

async function createUser(
  t: ReturnType<typeof convexTest>,
  {
    email,
    role,
    verified = false,
  }: {
    email: string
    role: 'admin' | 'staff' | 'member'
    verified?: boolean
  },
) {
  return t.run((ctx) =>
    ctx.db.insert('users', {
      email,
      name: `${role} user`,
      role,
      ...(verified ? { emailVerificationTime: Date.now() } : {}),
    }),
  )
}

async function createEventFixture(
  t: ReturnType<typeof convexTest>,
  {
    requireAccount = false,
    embedEnabled = false,
    allowChildren = false,
    allowCompanions = false,
    maxChildrenPerRegistration,
    maxCompanionsPerRegistration,
    maxCompanionsWithChildren,
  }: {
    requireAccount?: boolean
    embedEnabled?: boolean
    allowChildren?: boolean
    allowCompanions?: boolean
    maxChildrenPerRegistration?: number
    maxCompanionsPerRegistration?: number
    maxCompanionsWithChildren?: number
  } = {},
) {
  return t.run(async (ctx) => {
    const eventId = await ctx.db.insert('events', {
      title: 'Evento test',
      description: 'Descrizione',
      location: 'Roma',
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren,
      maxChildrenPerRegistration: allowChildren ? (maxChildrenPerRegistration ?? 2) : 0,
      allowCompanions,
      maxCompanionsPerRegistration: allowCompanions ? (maxCompanionsPerRegistration ?? 2) : 0,
      maxCompanionsWithChildren,
      checkInAccess: 'password',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
      embedEnabled,
      requireAccount,
    })
    const activityId = await ctx.db.insert('activities', {
      eventId,
      title: 'Laboratorio',
      start: '2026-07-07T09:00:00.000Z',
      end: '2026-07-07T10:00:00.000Z',
      slotDurationMinutes: 60,
      capacityPerSlot: 10,
      order: 0,
    })
    const slotId = await ctx.db.insert('slots', {
      eventId,
      activityId,
      start: '2026-07-07T09:00:00.000Z',
      end: '2026-07-07T10:00:00.000Z',
      capacity: 10,
      order: 0,
    })
    return { eventId, activityId, slotId }
  })
}

async function registrationsForEvent(
  t: ReturnType<typeof convexTest>,
  eventId: Id<'events'>,
) {
  return t.run((ctx) =>
    ctx.db
      .query('registrations')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect(),
  )
}

test('register rejects anonymous callers when the event requires a verified member account', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { requireAccount: true })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Per registrarti a questo evento devi accedere con un account Membro verificato')
})

test('register rejects unverified members when the event requires a verified member account', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, { requireAccount: true })

  await expect(
    t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Verifica la tua email prima di registrarti a questo evento')
})

test('register rejects non-member callers when the event requires a verified member account', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { requireAccount: true })
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const staffId = await createUser(t, { email: 'staff@example.com', role: 'staff', verified: true })

  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Admin',
      contactEmail: 'admin+guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Solo i Membri verificati possono registrarsi a questo evento')

  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Staff',
      contactEmail: 'staff+guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Solo i Membri verificati possono registrarsi a questo evento')
})

test('register rejects embedded registrations when requireAccount is enabled', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    requireAccount: true,
    embedEnabled: true,
  })

  await expect(
    t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
      embed: true,
    }),
  ).rejects.toThrow(
    'Questo evento richiede un account Membro verificato: completa la registrazione dal sito principale',
  )
})

test('register links the verified member, locks contactEmail, and still allows children and companions', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    requireAccount: true,
    allowChildren: true,
    allowCompanions: true,
  })

  const result = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [{ name: 'Figlio', age: 7 }],
      companions: [{ name: 'Accompagnatore' }],
      selections: [{ activityId, slotId }],
    })

  const [registration] = await registrationsForEvent(t, eventId)
  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', result.registrationId))
      .collect(),
  )

  expect(registration).toMatchObject({
    eventId,
    userId: memberId,
    contactEmail: 'member@example.com',
  })
  expect(result.contactEmail).toBe('member@example.com')
  expect(persons.map((person) => person.category)).toEqual(['user', 'child', 'companion'])
})

/* ------------------------------------------------------------------ */
/* Regola del nucleo familiare (issue #35)                             */
/* ------------------------------------------------------------------ */

test('register keeps independent Figli/Ospiti caps when maxCompanionsWithChildren is absent', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 2,
    maxCompanionsPerRegistration: 1,
  })

  // 2 figli + 1 ospite: entro i cap indipendenti, nessuna domanda di ramo coinvolta.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [{ name: 'Figlio 1', age: 5 }, { name: 'Figlio 2', age: 7 }],
      companions: [{ name: 'Ospite 1' }],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ eventTitle: 'Evento test' })

  // Superare il cap Ospiti resta bloccato esattamente come oggi, a prescindere dai figli.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Altra Persona',
      contactEmail: 'other@example.com',
      children: [],
      companions: [{ name: 'Ospite 1' }, { name: 'Ospite 2' }],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Puoi aggiungere al massimo 1 accompagnatori')
})

test('register rejects more Ospiti than the reduced cap when at least one Figlio is present', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    maxCompanionsWithChildren: 1,
  })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [{ name: 'Figlio 1', age: 5 }],
      companions: [{ name: 'Ospite 1' }, { name: 'Ospite 2' }],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Puoi aggiungere al massimo 1 ospiti')
})

test('register allows exactly the reduced Ospiti cap when a Figlio is present (boundary)', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    maxCompanionsWithChildren: 1,
  })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [{ name: 'Figlio 1', age: 5 }],
      companions: [{ name: 'Ospite 1' }],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ eventTitle: 'Evento test' })
})

test('register allows the full Ospiti cap when there are no Figli, even with the family rule active', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    maxCompanionsWithChildren: 1,
  })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [{ name: 'Ospite 1' }, { name: 'Ospite 2' }],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ eventTitle: 'Evento test' })
})

test('register still enforces the full Ospiti cap when there are no Figli and the family rule is active', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    maxCompanionsWithChildren: 1,
  })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [{ name: 'Ospite 1' }, { name: 'Ospite 2' }, { name: 'Ospite 3' }],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Puoi aggiungere al massimo 2 ospiti')
})

test('register links authenticated callers on anonymous events and locks contactEmail for members', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.register, {
    eventId,
    userName: 'Mario Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.register, {
    eventId,
    userName: 'Admin User',
    contactEmail: 'typed@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const registrations = await registrationsForEvent(t, eventId)
  expect(registrations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        userId: memberId,
        contactEmail: 'member@example.com',
      }),
      expect.objectContaining({
        userId: adminId,
        contactEmail: 'typed@example.com',
      }),
    ]),
  )
})

test('register keeps the anonymous flow unchanged and never links ownership by contactEmail', async () => {
  const t = convexTest(schema, modules)
  await createUser(t, {
    email: 'same@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const result = await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Guest',
    contactEmail: 'same@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const [registration] = await registrationsForEvent(t, eventId)

  expect(result.contactEmail).toBe('same@example.com')
  expect(registration).toMatchObject({
    eventId,
    contactEmail: 'same@example.com',
  })
  expect(registration?.userId).toBeUndefined()
})

test('myRegistrations returns only registrations belonging to the caller', async () => {
  const t = convexTest(schema, modules)
  const memberAId = await createUser(t, { email: 'a@example.com', role: 'member', verified: true })
  const memberBId = await createUser(t, { email: 'b@example.com', role: 'member', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.withIdentity({ subject: subjectFor(memberAId) }).mutation(api.registrations.register, {
    eventId,
    userName: 'Membro A',
    contactEmail: 'a@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  await t.withIdentity({ subject: subjectFor(memberBId) }).mutation(api.registrations.register, {
    eventId,
    userName: 'Membro B',
    contactEmail: 'b@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const resultA = await t
    .withIdentity({ subject: subjectFor(memberAId) })
    .query(api.registrations.myRegistrations, {})
  const resultB = await t
    .withIdentity({ subject: subjectFor(memberBId) })
    .query(api.registrations.myRegistrations, {})

  expect(resultA).toHaveLength(1)
  expect(resultA[0]).toMatchObject({ eventId, eventTitle: 'Evento test' })
  expect(resultB).toHaveLength(1)
  expect(resultA[0].id).not.toBe(resultB[0].id)
})

test('myRegistrations excludes anonymous registrations even with matching contactEmail', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  // Anonymous registration with the same email as the member
  await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Guest',
    contactEmail: 'member@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const result = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .query(api.registrations.myRegistrations, {})

  expect(result).toHaveLength(0)
})

test('myRegistrations returns empty array for unauthenticated callers', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Guest',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const result = await t.query(api.registrations.myRegistrations, {})
  expect(result).toHaveLength(0)
})

test('myRegistrations includes real check-in status for persons', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .mutation(api.registrations.register, {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'member@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    })

  // Simulate event check-in by setting eventCheckInAt directly
  const [person] = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  await t.run((ctx) =>
    ctx.db.patch(person._id, {
      eventCheckInAt: new Date().toISOString(),
      eventCheckInCount: 1,
    }),
  )

  const result = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .query(api.registrations.myRegistrations, {})

  expect(result).toHaveLength(1)
  const [reg] = result
  expect(reg.persons).toHaveLength(1)
  expect(reg.persons[0].eventCheckInAt).not.toBeNull()
  expect(reg.persons[0].eventCheckInCount).toBe(1)
})

test('checkins.checkIn rejects member operators on password events', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    requireAccount: false,
  })

  const { registrationId } = await t.withIdentity({ subject: subjectFor(memberId) }).mutation(
    api.registrations.register,
    {
      eventId,
      userName: 'Mario Rossi',
      contactEmail: 'member@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    },
  )

  const [person] = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )

  // Sanity check: admin is authorized for the same check-in operation.
  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.checkins.checkIn, {
      eventId,
      code: person.ticketCode,
      mode: 'event',
    }),
  ).resolves.toMatchObject({ status: 'event-valid' })

  // Member must not be authorized as check-in operator, even on password-mode events.
  await expect(
    t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.checkins.checkIn, {
      eventId,
      code: person.ticketCode,
      mode: 'event',
    }),
  ).rejects.toThrow('Accesso non autorizzato')
})

/* ------------------------------------------------------------------ */
/* Annullamento della Prenotazione (admin)                             */
/* ------------------------------------------------------------------ */

test('cancel rejects staff, member, and anonymous callers', async () => {
  const t = convexTest(schema, modules)
  const staffId = await createUser(t, { email: 'staff@example.com', role: 'staff', verified: true })
  const memberId = await createUser(t, { email: 'member@example.com', role: 'member', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Mario Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  await expect(t.mutation(api.registrations.cancel, { registrationId })).rejects.toThrow(
    'Non autenticato',
  )
  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).mutation(api.registrations.cancel, {
      registrationId,
    }),
  ).rejects.toThrow('Accesso riservato agli amministratori')
  await expect(
    t.withIdentity({ subject: subjectFor(memberId) }).mutation(api.registrations.cancel, {
      registrationId,
    }),
  ).rejects.toThrow('Accesso riservato agli amministratori')

  // Sanity check: the registration survived every rejected attempt.
  const stillThere = await t.run((ctx) => ctx.db.get(registrationId))
  expect(stillThere).not.toBeNull()
})

test('cancel throws for a nonexistent registration', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)
  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Mario Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.cancel, {
    registrationId,
  })

  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.cancel, {
      registrationId,
    }),
  ).rejects.toThrow('Prenotazione non trovata')
})

test('cancel removes the Prenotazione end-to-end: Persone, selections, check-ins, admin listing, frees capacity, and invalidates QR codes', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  // Shrink the slot so a single-person registration fills it completely.
  await t.run((ctx) => ctx.db.patch(slotId, { capacity: 1 }))

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userName: 'Mario Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const [person] = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )

  // Seed an activity check-in directly, bypassing the slot time-window checks.
  await t.run((ctx) =>
    ctx.db.insert('activityCheckIns', {
      personId: person._id,
      eventId,
      activityId,
      slotId,
      at: new Date().toISOString(),
      count: 1,
      lastAt: new Date().toISOString(),
    }),
  )

  // The slot is now full: a competing registration is rejected.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Altra Persona',
      contactEmail: 'other@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Posti insufficienti')

  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.cancel, {
    registrationId,
  })

  expect(await t.run((ctx) => ctx.db.get(registrationId))).toBeNull()
  expect(
    await t.run((ctx) =>
      ctx.db
        .query('persons')
        .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
        .collect(),
    ),
  ).toHaveLength(0)
  expect(
    await t.run((ctx) =>
      ctx.db
        .query('slotSelections')
        .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
        .collect(),
    ),
  ).toHaveLength(0)
  expect(
    await t.run((ctx) =>
      ctx.db
        .query('activityCheckIns')
        .withIndex('by_person', (q) => q.eq('personId', person._id))
        .collect(),
    ),
  ).toHaveLength(0)

  const remaining = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.registrations.listAll, { eventId })
  expect(remaining.map((r) => r.id)).not.toContain(registrationId)

  // Capacity freed: the previously-failing registration now succeeds.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userName: 'Altra Persona',
      contactEmail: 'other@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ eventTitle: 'Evento test' })

  // QR invalidated: scanning the cancelled Persona's ticket code returns not-found.
  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.checkins.checkIn, {
      eventId,
      code: person.ticketCode,
      mode: 'event',
    }),
  ).resolves.toMatchObject({ status: 'not-found' })
})
