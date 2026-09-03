/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { fullName } from '../../lib/person-name'
import { MAX_NOTES_LENGTH, NOTES_TOO_LONG_ERROR } from '../../convex/registrations'

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
    collectNames,
    collectAllergies,
    collectNotes,
    confirmParticipation,
    privacyNotice,
  }: {
    requireAccount?: boolean
    embedEnabled?: boolean
    allowChildren?: boolean
    allowCompanions?: boolean
    maxChildrenPerRegistration?: number
    maxCompanionsPerRegistration?: number
    maxCompanionsWithChildren?: number
    /** Omesso = campo assente (l'app lo tratta come «Raccolta nomi» attiva). */
    collectNames?: boolean
    /** Omesso = campo assente (l'app lo tratta come allergie non richieste). */
    collectAllergies?: boolean
    /** Nota (ADR 0019). Omesso = campo assente (l'app lo tratta come Nota non richiesta). */
    collectNotes?: boolean
    confirmParticipation?: boolean
    privacyNotice?: string
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
      ...(collectNames === undefined ? {} : { collectNames }),
      ...(collectAllergies === undefined ? {} : { collectAllergies }),
      ...(collectNotes === undefined ? {} : { collectNotes }),
      ...(confirmParticipation === undefined ? {} : { confirmParticipation }),
      ...(privacyNotice === undefined ? {} : { privacyNotice }),
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
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
      userFirstName: 'Admin',
      userLastName: 'Test',
      contactEmail: 'admin+guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Solo i Membri verificati possono registrarsi a questo evento')

  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Staff',
      userLastName: 'Test',
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [{ firstName: 'Figlio', age: 7 }],
      companions: [{ firstName: 'Accompagnatore' }],
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [{ firstName: 'Figlio 1', age: 5 }, { firstName: 'Figlio 2', age: 7 }],
      companions: [{ firstName: 'Ospite 1' }],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ eventTitle: 'Evento test' })

  // Superare il cap Ospiti resta bloccato esattamente come oggi, a prescindere dai figli.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Altra',
      userLastName: 'Persona',
      contactEmail: 'other@example.com',
      children: [],
      companions: [{ firstName: 'Ospite 1' }, { firstName: 'Ospite 2' }],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Puoi aggiungere al massimo 1 ospiti')
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [{ firstName: 'Figlio 1', age: 5 }],
      companions: [{ firstName: 'Ospite 1' }, { firstName: 'Ospite 2' }],
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [{ firstName: 'Figlio 1', age: 5 }],
      companions: [{ firstName: 'Ospite 1' }],
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [{ firstName: 'Ospite 1' }, { firstName: 'Ospite 2' }],
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [{ firstName: 'Ospite 1' }, { firstName: 'Ospite 2' }, { firstName: 'Ospite 3' }],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Puoi aggiungere al massimo 2 ospiti')
})

/* ------------------------------------------------------------------ */
/* Etichetta posizionale / Raccolta nomi (issue #36)                   */
/* ------------------------------------------------------------------ */

test('register generates positional labels and ignores client-sent names when Raccolta nomi is off', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    collectNames: false,
  })

  const { registrationId, persons: returned } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    // These names must be ignored server-side and replaced by positional labels.
    children: [
      { firstName: 'Marco', age: 5 },
      { firstName: 'Anna', age: 8 },
    ],
    companions: [{ firstName: 'Zia Pina' }],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  const byCategory = (cat: 'user' | 'child' | 'companion') =>
    persons.filter((p) => p.category === cat)

  // The Iscritto keeps their own name; Figli/Ospiti get progressive labels.
  expect(byCategory('user').map(fullName)).toEqual(['Mario Rossi'])
  expect(byCategory('child').map(fullName).sort()).toEqual(['Figlio 1', 'Figlio 2'])
  expect(byCategory('companion').map(fullName)).toEqual(['Ospite 1'])
  // L'Etichetta posizionale si ricorda di essere generata (ADR 0017): è ciò
  // che impedisce a un cambio di «Raccolta nomi» di reinterpretarla.
  expect(byCategory('child').every((p) => p.nameProvided)).toBe(false)
  expect(byCategory('user').every((p) => p.nameProvided)).toBe(true)

  // Ages are still persisted for Figli even without names.
  expect(byCategory('child').map((p) => p.age).sort()).toEqual([5, 8])

  // The mutation return (drives QR/email/tickets) carries the labels, not the client names.
  const returnedNames = returned.map(fullName).sort()
  expect(returnedNames).toEqual(['Figlio 1', 'Figlio 2', 'Mario Rossi', 'Ospite 1'])
  expect(returnedNames).not.toContain('Marco')
  expect(returnedNames).not.toContain('Zia Pina')
})

test('register keeps client-sent names when Raccolta nomi is on (setting-on unchanged)', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    collectNames: true,
  })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [{ firstName: 'Zia Pina' }],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(persons.map(fullName).sort()).toEqual(['Marco', 'Mario Rossi', 'Zia Pina'])
})

test('register treats a legacy event without the collectNames field as Raccolta nomi on', async () => {
  const t = convexTest(schema, modules)
  // collectNames omitted entirely: the field is absent on the event document.
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
  })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [{ firstName: 'Zia Pina' }],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(persons.map(fullName).sort()).toEqual(['Marco', 'Mario Rossi', 'Zia Pina'])
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
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Admin',
    userLastName: 'User',
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
    userFirstName: 'Guest',
    userLastName: 'Test',
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

test('register blocks an email that already has a Prenotazione on the same event (ADR 0005)', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)
  const { eventId: otherEventId, activityId: otherActivityId, slotId: otherSlotId } =
    await createEventFixture(t)

  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  // Stessa email (normalizzata) sullo stesso Evento: bloccata.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: '  Mario@Example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Questa e-mail è già stata utilizzata per una registrazione a questo evento.')
  expect(await registrationsForEvent(t, eventId)).toHaveLength(1)

  // La stessa email resta libera su un altro Evento.
  await expect(
    t.mutation(api.registrations.register, {
      eventId: otherEventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'mario@example.com',
      children: [],
      companions: [],
      selections: [{ activityId: otherActivityId, slotId: otherSlotId }],
    }),
  ).resolves.toMatchObject({ contactEmail: 'mario@example.com' })
})

test('myRegistrations returns only registrations belonging to the caller', async () => {
  const t = convexTest(schema, modules)
  const memberAId = await createUser(t, { email: 'a@example.com', role: 'member', verified: true })
  const memberBId = await createUser(t, { email: 'b@example.com', role: 'member', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  await t.withIdentity({ subject: subjectFor(memberAId) }).mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Membro',
    userLastName: 'A',
    contactEmail: 'a@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  await t.withIdentity({ subject: subjectFor(memberBId) }).mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Membro',
    userLastName: 'B',
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
    userFirstName: 'Guest',
    userLastName: 'Test',
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
    userFirstName: 'Guest',
    userLastName: 'Test',
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
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
      userFirstName: 'Mario',
      userLastName: 'Rossi',
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
    userFirstName: 'Mario',
    userLastName: 'Rossi',
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
    userFirstName: 'Mario',
    userLastName: 'Rossi',
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
    userFirstName: 'Mario',
    userLastName: 'Rossi',
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
      userFirstName: 'Altra',
      userLastName: 'Persona',
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
      userFirstName: 'Altra',
      userLastName: 'Persona',
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

/* ------------------------------------------------------------------ */
/* Allergie e intolleranze (issue #37)                                 */
/* ------------------------------------------------------------------ */

test('register persists the allergy declaration of every Persona when the event asks for it', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    collectAllergies: true,
  })

  const { registrationId, persons: returned } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: 'Lattosio',
    children: [{ firstName: 'Marco', age: 5, allergies: 'Arachidi' }],
    companions: [{ firstName: 'Zia Pina', allergies: 'Glutine' }],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  const allergiesByName = Object.fromEntries(persons.map((p) => [fullName(p), p.allergies ?? null]))
  expect(allergiesByName).toEqual({
    'Mario Rossi': 'Lattosio',
    Marco: 'Arachidi',
    'Zia Pina': 'Glutine',
  })

  // The mutation result feeds the confirmation email, so it carries them too.
  expect(
    Object.fromEntries(returned.map((p) => [fullName(p), p.allergies])),
  ).toEqual({ 'Mario Rossi': 'Lattosio', Marco: 'Arachidi', 'Zia Pina': 'Glutine' })
})

test('register treats an empty or blank allergy declaration as «nessuna dichiarata»', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    collectAllergies: true,
  })

  const { registrationId, persons: returned } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: '   ',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(persons.every((p) => p.allergies === undefined)).toBe(true)
  expect(returned.every((p) => p.allergies === null)).toBe(true)
})

test('register ignores submitted allergies when the event does not ask for them', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    collectAllergies: false,
    collectNotes: false,
  })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: 'Lattosio',
    children: [{ firstName: 'Marco', age: 5, allergies: 'Arachidi' }],
    companions: [{ firstName: 'Zia Pina', allergies: 'Glutine' }],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(persons).toHaveLength(3)
  expect(persons.every((p) => p.allergies === undefined)).toBe(true)
})

test('register on a legacy event without the collectAllergies field stores no allergies', async () => {
  const t = convexTest(schema, modules)
  // collectAllergies omitted entirely: the field is absent on the event document.
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: 'Lattosio',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(persons.map((p) => p.allergies)).toEqual([undefined])
})

test('registrations.listAll exposes per-person allergies for the admin detail and the export', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin' })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    collectAllergies: true,
  })

  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: 'Lattosio',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const [registration] = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.registrations.listAll, { eventId })

  expect(
    Object.fromEntries(registration.persons.map((p) => [fullName(p), p.allergies])),
  ).toEqual({ 'Mario Rossi': 'Lattosio', Marco: null })
})

test('checkIn returns the scanned person allergies in the result card payload', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin' })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    collectAllergies: true,
  })

  const { persons } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: 'Lattosio',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  const withAllergies = persons.find((p) => p.category === 'user')!
  const withoutAllergies = persons.find((p) => p.category === 'child')!

  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })
  await expect(
    asAdmin.mutation(api.checkins.checkIn, {
      eventId,
      code: withAllergies.ticketCode,
      mode: 'event',
    }),
  ).resolves.toMatchObject({ status: 'event-valid', person: { allergies: 'Lattosio' } })

  await expect(
    asAdmin.mutation(api.checkins.checkIn, {
      eventId,
      code: withoutAllergies.ticketCode,
      mode: 'event',
    }),
  ).resolves.toMatchObject({ status: 'event-valid', person: { allergies: null } })
})

test('register rejects an allergy declaration longer than the server-side limit', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    collectAllergies: true,
  })

  // The client caps the field too, but the mutation must not trust it.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      userAllergies: 'a'.repeat(301),
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('non può superare i 300 caratteri')

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [{ firstName: 'Marco', age: 5, allergies: 'a'.repeat(301) }],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('non può superare i 300 caratteri')

  // Nothing was persisted by either rejected attempt.
  expect(await registrationsForEvent(t, eventId)).toHaveLength(0)
  expect(
    await t.run((ctx) =>
      ctx.db
        .query('persons')
        .withIndex('by_event', (q) => q.eq('eventId', eventId))
        .collect(),
    ),
  ).toHaveLength(0)
})

/* ------------------------------------------------------------------ */
/* Reinvio dell'email dei biglietti (issue #40)                        */
/* ------------------------------------------------------------------ */

test('resendTickets rejects staff, member, and anonymous callers', async () => {
  const t = convexTest(schema, modules)
  const staffId = await createUser(t, { email: 'staff@example.com', role: 'staff', verified: true })
  const memberId = await createUser(t, {
    email: 'member@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  await expect(
    t.mutation(api.registrations.resendTickets, {
      registrationId,
      contactEmail: 'attacker@example.com',
    }),
  ).rejects.toThrow('Non autenticato')
  await expect(
    t.withIdentity({ subject: subjectFor(staffId) }).mutation(api.registrations.resendTickets, {
      registrationId,
      contactEmail: 'attacker@example.com',
    }),
  ).rejects.toThrow('Accesso riservato agli amministratori')
  await expect(
    t
      .withIdentity({ subject: subjectFor(memberId) })
      .mutation(api.registrations.resendTickets, {
        registrationId,
        contactEmail: 'attacker@example.com',
      }),
  ).rejects.toThrow('Accesso riservato agli amministratori')

  // Sanity check: no rejected attempt rewrote the stored contact email.
  expect(await t.run((ctx) => ctx.db.get(registrationId))).toMatchObject({
    contactEmail: 'guest@example.com',
  })
})

test('resendTickets throws for a nonexistent registration', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)
  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  await t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.cancel, {
    registrationId,
  })

  await expect(
    t.withIdentity({ subject: subjectFor(adminId) }).mutation(api.registrations.resendTickets, {
      registrationId,
      contactEmail: 'guest@example.com',
    }),
  ).rejects.toThrow('Prenotazione non trovata')
})

/* ------------------------------------------------------------------ */
/* Consegna dell'email di conferma (ADR 0015, 0016)                    */
/* ------------------------------------------------------------------ */

test('register apre la Consegna e pianifica l’invio nella propria transazione', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  // È l'invariante centrale dell'ADR 0015: se la Prenotazione esiste, esiste
  // anche il suo tentativo di invio. «L'email non è mai partita perché il
  // client non è tornato» smette di essere una categoria di guasto.
  const deliveries = await t.run((ctx) =>
    ctx.db
      .query('emailDeliveries')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(deliveries).toHaveLength(1)
  expect(deliveries[0]).toMatchObject({
    recipient: 'guest@example.com',
    outcome: 'pending',
  })
  // La riga nasce col tentativo, non col suo esito: `closedAt` arriva solo
  // quando il provider risponde.
  expect(deliveries[0].closedAt).toBeUndefined()
})

test('la Consegna porta il destinatario davvero persistito, non quello digitato', async () => {
  const t = convexTest(schema, modules)
  const memberId = await createUser(t, {
    email: 'membro@example.com',
    role: 'member',
    verified: true,
  })
  const { eventId, activityId, slotId } = await createEventFixture(t, { requireAccount: true })

  const { registrationId } = await t
    .withIdentity({ subject: subjectFor(memberId) })
    .mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      // Per un Membro vince l'email dell'account: la Consegna deve registrare
      // quella, altrimenti lo storico direbbe una cosa che non è avvenuta.
      contactEmail: 'altra@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
    })

  const [delivery] = await t.run((ctx) =>
    ctx.db
      .query('emailDeliveries')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(delivery.recipient).toBe('membro@example.com')
})

test('l’Annullamento della Prenotazione non lascia Consegne orfane', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  // Due Consegne, così la cancellazione deve prenderle tutte e non solo l'ultima.
  await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.resendTickets, { registrationId })

  await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.cancel, { registrationId })

  // La riga porta un indirizzo email: un dato personale non sopravvive alla
  // riga che lo giustificava (ADR 0016).
  const remaining = await t.run((ctx) => ctx.db.query('emailDeliveries').collect())
  expect(remaining).toEqual([])
})

test('chiudere una Consegna ne registra esito e motivo, e l’Esito vede l’ultima', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const [first] = await t.run((ctx) =>
    ctx.db
      .query('emailDeliveries')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  await t.mutation(internal.emailDeliveries.close, {
    deliveryId: first._id,
    outcome: 'rejected',
    reason: 'validation_error: The domain is not verified',
  })

  expect(await t.run((ctx) => ctx.db.get(first._id))).toMatchObject({
    outcome: 'rejected',
    reason: 'validation_error: The domain is not verified',
  })

  // La query pubblica ritorna **solo l'enum**: né indirizzo né nomi, perché la
  // chiama chi ha appena prenotato e non è autenticato.
  expect(
    await t.query(api.emailDeliveries.outcomeForRegistration, { registrationId }),
  ).toBe('rejected')

  // Il Reinvio apre un'altra riga, e a contare è la più recente.
  await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.resendTickets, { registrationId })
  expect(
    await t.query(api.emailDeliveries.outcomeForRegistration, { registrationId }),
  ).toBe('pending')
})

test('chiudere una Consegna già cancellata non solleva: non c’è più niente da registrare', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  const [delivery] = await t.run((ctx) =>
    ctx.db
      .query('emailDeliveries')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )

  // L'Annullamento porta via le Consegne mentre l'action è ancora in volo.
  await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.cancel, { registrationId })

  await expect(
    t.mutation(internal.emailDeliveries.close, { deliveryId: delivery._id, outcome: 'delivered' }),
  ).resolves.toBeNull()
})

test('senza Consegne registrate l’Esito non dice niente', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)
  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  // Le Prenotazioni anteriori a questo lavoro non hanno righe: nessun backfill.
  await t.run(async (ctx) => {
    for (const d of await ctx.db.query('emailDeliveries').collect()) await ctx.db.delete(d._id)
  })

  expect(
    await t.query(api.emailDeliveries.outcomeForRegistration, { registrationId }),
  ).toBeNull()
})

test('listAll porta in admin l’ultima Consegna per Prenotazione', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })
  const [delivery] = await t.run((ctx) =>
    ctx.db
      .query('emailDeliveries')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  await t.mutation(internal.emailDeliveries.close, {
    deliveryId: delivery._id,
    outcome: 'simulated',
    reason: 'RESEND_API_KEY non configurata',
  })

  const [listed] = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.registrations.listAll, { eventId })
  expect(listed.emailDelivery).toEqual({
    outcome: 'simulated',
    startedAt: delivery._creationTime,
  })
})

test('il Reinvio apre una nuova Consegna col destinatario corretto, e i biglietti restano gli stessi', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 5,
    maxCompanionsPerRegistration: 2,
    collectAllergies: true,
  })

  const { registrationId, persons: registered } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: 'Lattosio',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [{ firstName: 'Zia Pina', allergies: 'Glutine' }],
    selections: [{ activityId, slotId }],
  })

  const result = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.resendTickets, {
      registrationId,
      contactEmail: 'nuovo@example.com',
    })

  expect(result).toEqual({ contactEmail: 'nuovo@example.com' })

  // Il Reinvio non sovrascrive la Consegna precedente: ne apre un'altra. È il
  // punto su cui la tabella si ripaga — avendo cambiato qui il destinatario,
  // un campo solo non saprebbe più dire dov'erano andate le email di prima.
  const deliveries = await t.run((ctx) =>
    ctx.db
      .query('emailDeliveries')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(deliveries.map((d) => d.recipient)).toEqual(['guest@example.com', 'nuovo@example.com'])
  expect(deliveries.map((d) => d.outcome)).toEqual(['pending', 'pending'])

  // L'action rilegge la Prenotazione, quindi l'email porta le Persone attuali
  // e i ticketCode originali: i biglietti già in mano all'Utente restano validi.
  const document = await t.query(internal.emailContent.ticketEmailDocument, { registrationId })
  // La correzione vale da qui in avanti per ogni comunicazione, non solo per
  // questo invio (user story 28).
  expect(await t.run((ctx) => ctx.db.get(registrationId))).toMatchObject({
    contactEmail: 'nuovo@example.com',
  })
  expect(document.pdf.persons).toEqual([
    {
      firstName: 'Mario',
      lastName: 'Rossi',
      category: 'user',
      age: null,
      allergies: 'Lattosio',
      ticketCode: expect.any(String),
    },
    {
      firstName: 'Marco',
      lastName: null,
      category: 'child',
      age: 5,
      allergies: null,
      ticketCode: expect.any(String),
    },
    {
      firstName: 'Zia Pina',
      lastName: null,
      category: 'companion',
      age: null,
      allergies: 'Glutine',
      ticketCode: expect.any(String),
    },
  ])
  expect(document.pdf.persons.map((p) => p.ticketCode).sort()).toEqual(
    registered.map((p) => p.ticketCode).sort(),
  )
})

test("l'email del Reinvio porta le Etichette posizionali attuali", async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    collectNames: false,
  })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, { registrationId })
  expect(document.pdf.persons.map(fullName)).toEqual(['Mario Rossi', 'Figlio 1'])
})

test('resendTickets persists a corrected recipient on the Prenotazione', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'typo@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const payload = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.resendTickets, {
      registrationId,
      // Extra spaces are the admin's typing, not part of the address.
      contactEmail: '  corretto@example.com  ',
    })

  // The email goes to the corrected address...
  expect(payload.contactEmail).toBe('corretto@example.com')
  // ...and every future communication does too.
  expect(await t.run((ctx) => ctx.db.get(registrationId))).toMatchObject({
    contactEmail: 'corretto@example.com',
  })
  const [listed] = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.registrations.listAll, { eventId })
  expect(listed.contactEmail).toBe('corretto@example.com')
})

test('resendTickets falls back to the stored recipient when none is given', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const payload = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.resendTickets, { registrationId })

  expect(payload.contactEmail).toBe('guest@example.com')
  expect(await t.run((ctx) => ctx.db.get(registrationId))).toMatchObject({
    contactEmail: 'guest@example.com',
  })
})

test('resendTickets rejects an invalid recipient without touching the stored one', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const asAdmin = t.withIdentity({ subject: subjectFor(adminId) })
  await expect(
    asAdmin.mutation(api.registrations.resendTickets, {
      registrationId,
      contactEmail: 'non-una-email',
    }),
  ).rejects.toThrow('Indirizzo email non valido')
  await expect(
    asAdmin.mutation(api.registrations.resendTickets, {
      registrationId,
      contactEmail: '   ',
    }),
  ).rejects.toThrow('Indirizzo email non valido')

  expect(await t.run((ctx) => ctx.db.get(registrationId))).toMatchObject({
    contactEmail: 'guest@example.com',
  })
})

test('getActivityAttendance exposes per-person allergies for the admin detail', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin' })
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 5,
    collectAllergies: true,
  })

  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    userAllergies: 'Lattosio',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const activities = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.attendance.getActivityAttendance, { eventId })

  const persons = activities[0].slots[0].persons
  expect(
    Object.fromEntries(persons.map((p) => [fullName(p), p.allergies])),
  ).toEqual({ 'Mario Rossi': 'Lattosio', Marco: null })
})

/* ------------------------------------------------------------------ */
/* Date proprie dell'Evento nell'header del biglietto (issue #45)      */
/* ------------------------------------------------------------------ */

test('la data dichiarata dall’Evento finisce nell’header del biglietto, non quella derivata', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t)

  // L'Evento dichiara di cominciare alle 08 e non dichiara la fine: sul
  // biglietto deve finire quell'inizio, non le 09:00 del laboratorio, e una
  // fine ancora derivata dall'ultima Attività (ADR 0009).
  await t.run((ctx) => ctx.db.patch(eventId, { startsAt: '2026-07-07T08:00:00.000Z' }))

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, { registrationId })
  // Il fuso è dichiarato (Europe/Rome): l'header del biglietto spedito deve
  // leggersi come quello scaricato dalla pagina, non spostato su UTC.
  expect(document.pdf.eventDateRange).toBe('7 luglio 2026, 10:00 \u2013 12:00')
})

test('se register fallisce non resta né Prenotazione né Consegna', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 1,
  })

  // L'altra metà dell'invariante dell'ADR 0015: se la Prenotazione non nasce,
  // non nasce nemmeno il suo tentativo di invio. Vale per costruzione — la
  // riga e la pianificazione sono le ultime scritture della mutation, e una
  // mutation Convex è una transazione — ma è proprio l'implicazione su cui
  // poggia tutto il resto, quindi qui la si prova invece di assumerla.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [
        { firstName: 'Marco', age: 5 },
        { firstName: 'Luca', age: 7 },
      ],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).rejects.toThrow('Puoi aggiungere al massimo 1 figli')

  expect(await t.run((ctx) => ctx.db.query('emailDeliveries').collect())).toEqual([])
  expect(await t.run((ctx) => ctx.db.query('registrations').collect())).toEqual([])
})

test('la Consegna congela il destinatario: un Reinvio non lo cambia sotto i piedi', async () => {
  const t = convexTest(schema, modules)
  const adminId = await createUser(t, { email: 'admin@example.com', role: 'admin', verified: true })
  const { eventId, activityId, slotId } = await createEventFixture(t)

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'primo@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
  })

  // Il Reinvio corregge `contactEmail` sulla Prenotazione mentre la prima
  // action può essere ancora in volo. La riga già aperta deve continuare a
  // dichiarare il destinatario per cui è nata: è l'unica cosa che rende vero
  // «la riga porta il destinatario effettivamente usato» (ADR 0016), ed è il
  // motivo per cui l'action lo riceve invece di rileggerlo dalla Prenotazione.
  await t
    .withIdentity({ subject: subjectFor(adminId) })
    .mutation(api.registrations.resendTickets, {
      registrationId,
      contactEmail: 'secondo@example.com',
    })

  const deliveries = await t.run((ctx) =>
    ctx.db
      .query('emailDeliveries')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  expect(deliveries.map((d) => d.recipient)).toEqual(['primo@example.com', 'secondo@example.com'])
})

/* ------------------------------------------------------------------ */

test("register rejects a Figlio's age outside 0-17", async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    maxChildrenPerRegistration: 2,
  })

  // Il validator Convex accetta qualunque `v.number()`: senza il controllo
  // nella mutation, un client che non passa dal form scriverebbe «Figlio 1 ·
  // 42 anni» su biglietti, email di conferma e scanner.
  for (const age of [42, -1, 3.5, Number.NaN]) {
    await expect(
      t.mutation(api.registrations.register, {
        eventId,
        userFirstName: 'Mario',
        userLastName: 'Rossi',
        contactEmail: `guest-${String(age)}@example.com`,
        children: [{ firstName: 'Anna Rossi', age }],
        companions: [],
        selections: [{ activityId, slotId }],
      }),
    ).rejects.toThrow('L’età di un figlio deve essere un numero intero tra 0 e 17')
  }

  // Gli estremi ammessi restano ammessi: 0 è un'età vera, se qualcuno la scrive.
  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [
        { firstName: 'Anna Rossi', age: 0 },
        { firstName: 'Luca Rossi', age: 17 },
      ],
      companions: [],
      selections: [{ activityId, slotId }],
    }),
  ).resolves.toMatchObject({ eventTitle: 'Evento test' })
})

/* ------------------------------------------------------------------ */
/* Nome e cognome in due colonne (ADR 0017)                            */
/* ------------------------------------------------------------------ */

test('register persiste nome e cognome in due colonne, e il cognome è solo dell’Iscritto', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    allowChildren: true,
    allowCompanions: true,
    maxChildrenPerRegistration: 2,
    maxCompanionsPerRegistration: 2,
  })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: '  Mario  ',
    userLastName: ' De Luca ',
    contactEmail: 'guest@example.com',
    children: [{ firstName: 'Marco', age: 5 }],
    companions: [{ firstName: 'Zia Pina' }],
    selections: [{ activityId, slotId }],
  })

  const persons = await t.run((ctx) =>
    ctx.db
      .query('persons')
      .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
      .collect(),
  )
  const byCategory = (cat: 'user' | 'child' | 'companion') =>
    persons.find((p) => p.category === cat)!

  // Il cognome composto resta intero: si spezza sul primo spazio solo il
  // suggerimento del form, mai il dato inviato.
  expect(byCategory('user')).toMatchObject({
    firstName: 'Mario',
    lastName: 'De Luca',
    nameProvided: true,
  })
  // A Figli e Ospiti il cognome non si chiede: la riga non ne ha uno.
  expect(byCategory('child').lastName).toBeUndefined()
  expect(byCategory('companion').lastName).toBeUndefined()
  expect(byCategory('child')).toMatchObject({ firstName: 'Marco', nameProvided: true })

  // Nome completo per la visualizzazione: «Mario De Luca», mai «De Luca Mario».
  expect(persons.map(fullName).sort()).toEqual(['Marco', 'Mario De Luca', 'Zia Pina'])
})


/* ------------------------------------------------------------------ */
/* Nota (ADR 0019)                                                     */
/* ------------------------------------------------------------------ */

test('register persists the note when the event asks for one', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { collectNotes: true })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
    notes: '  Arriviamo verso le 21.\nSiamo in sedia a rotelle.  ',
  })

  const registration = await t.run((ctx) => ctx.db.get(registrationId))
  // Trim ai bordi, a-capo interni conservati.
  expect(registration?.notes).toBe('Arriviamo verso le 21.\nSiamo in sedia a rotelle.')
})

test('register ignores a submitted note when the event does not ask for one', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { collectNotes: false })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
    notes: 'Una nota che nessuno ha chiesto',
  })

  const registration = await t.run((ctx) => ctx.db.get(registrationId))
  expect(registration?.notes).toBeUndefined()
})

test('register leaves the note absent when it is empty or only spaces', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { collectNotes: true })

  const { registrationId } = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
    notes: '   ',
  })

  const registration = await t.run((ctx) => ctx.db.get(registrationId))
  expect(registration?.notes).toBeUndefined()
})

test('register rejects a note longer than the cap, without writing anything', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { collectNotes: true })

  await expect(
    t.mutation(api.registrations.register, {
      eventId,
      userFirstName: 'Mario',
      userLastName: 'Rossi',
      contactEmail: 'guest@example.com',
      children: [],
      companions: [],
      selections: [{ activityId, slotId }],
      notes: 'x'.repeat(MAX_NOTES_LENGTH + 1),
    }),
  ).rejects.toThrow(NOTES_TOO_LONG_ERROR)

  // Il rifiuto precede ogni scrittura: nessuna Prenotazione con le Persone
  // già create e la Nota persa per strada.
  const registrations = await t.run((ctx) => ctx.db.query('registrations').collect())
  const persons = await t.run((ctx) => ctx.db.query('persons').collect())
  expect(registrations).toHaveLength(0)
  expect(persons).toHaveLength(0)
})

test('the note never leaves the admin surface: it is not on any person or ticket', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, {
    collectNotes: true,
    allowCompanions: true,
    maxCompanionsPerRegistration: 2,
  })

  const result = await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [{ firstName: 'Zia Pina' }],
    selections: [{ activityId, slotId }],
    notes: 'Testo che non deve tornare indietro',
  })

  // La Nota è della Prenotazione: non viene copiata su nessuna Persona, e il
  // DTO restituito al form pubblico — quello da cui nascono i biglietti — non
  // la porta (ADR 0019).
  const persons = await t.run((ctx) => ctx.db.query('persons').collect())
  expect(persons).toHaveLength(2)
  for (const person of persons) {
    expect(JSON.stringify(person)).not.toContain('Testo che non deve tornare indietro')
  }
  expect(JSON.stringify(result.persons)).not.toContain('Testo che non deve tornare indietro')
})

test('listAll exposes the note to admin', async () => {
  const t = convexTest(schema, modules)
  const { eventId, activityId, slotId } = await createEventFixture(t, { collectNotes: true })
  const adminId = await createUser(t, {
    email: 'admin@example.com',
    role: 'admin',
    verified: true,
  })

  await t.mutation(api.registrations.register, {
    eventId,
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'guest@example.com',
    children: [],
    companions: [],
    selections: [{ activityId, slotId }],
    notes: 'Allergico al rumore',
  })

  const listed = await t
    .withIdentity({ subject: subjectFor(adminId) })
    .query(api.registrations.listAll, { eventId })
  expect(listed[0]?.notes).toBe('Allergico al rumore')
})
