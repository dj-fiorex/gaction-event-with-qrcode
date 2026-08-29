/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')

async function createEventFixture(
  t: ReturnType<typeof convexTest>,
  {
    title = 'Evento test',
    location = 'Roma',
    collectNames,
    emailSubject,
    emailBody,
  }: {
    title?: string
    location?: string
    /** Omesso = campo assente (l'app lo tratta come «Raccolta nomi» attiva). */
    collectNames?: boolean
    /** Omesso = campo assente (l'app ripiega sull'oggetto odierno). */
    emailSubject?: string
    /** Omesso = campo assente (l'app ripiega sul corpo odierno). */
    emailBody?: string
  } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert('events', {
      title,
      description: 'Descrizione',
      location,
      activityPolicy: 'free',
      minActivities: 0,
      allowOverlap: false,
      checkInToleranceMinutes: 15,
      allowQrReuse: false,
      allowChildren: true,
      maxChildrenPerRegistration: 2,
      allowCompanions: true,
      maxCompanionsPerRegistration: 2,
      checkInAccess: 'private',
      scanToken: `scan-${Math.random().toString(36).slice(2)}`,
      checkInPasswordHash: null,
      scanUnlockToken: null,
      ...(collectNames === undefined ? {} : { collectNames }),
      ...(emailSubject === undefined ? {} : { emailSubject }),
      ...(emailBody === undefined ? {} : { emailBody }),
    }),
  )
}

interface PersonFixture {
  name: string
  category: 'user' | 'child' | 'companion'
  age?: number | null
  allergies?: string
  ticketCode: string
}

async function createBookingFixture(
  t: ReturnType<typeof convexTest>,
  eventId: Id<'events'>,
  {
    contactEmail = 'utente@example.com',
    persons = [],
  }: { contactEmail?: string; persons?: PersonFixture[] } = {},
) {
  return t.run(async (ctx) => {
    const registrationId = await ctx.db.insert('registrations', { eventId, contactEmail })
    for (const person of persons) {
      await ctx.db.insert('persons', {
        registrationId,
        eventId,
        name: person.name,
        category: person.category,
        age: person.age ?? null,
        ...(person.allergies === undefined ? {} : { allergies: person.allergies }),
        ticketCode: person.ticketCode,
        eventCheckInAt: null,
        eventCheckInCount: 0,
        eventCheckInLastAt: null,
      })
    }
    return registrationId
  })
}

test('ticketEmailDocument fails with a clear error for a booking that does not exist', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t)
  // Prenotazione cancellata: è ciò che vede il reinvio quando l'admin annulla
  // la Prenotazione mentre il dialog è aperto.
  const registrationId = await createBookingFixture(t, eventId)
  await t.run((ctx) => ctx.db.delete(registrationId))

  await expect(
    t.query(internal.emailContent.ticketEmailDocument, { registrationId, hasPdf: true }),
  ).rejects.toThrow('Prenotazione non trovata')
})

test('ticketEmailDocument uses the event subject, and falls back when it is empty', async () => {
  const t = convexTest(schema, modules)
  const authored = await createEventFixture(t, {
    title: 'Maestri d’Acciaio',
    emailSubject: '26 Settembre – Maestri d’Acciaio. La tua prenotazione è confermata!',
  })
  const withoutSubject = await createEventFixture(t, { title: 'Maestri d’Acciaio' })
  const blankSubject = await createEventFixture(t, {
    title: 'Maestri d’Acciaio',
    emailSubject: '   ',
  })

  const documents = await Promise.all(
    [authored, withoutSubject, blankSubject].map(async (eventId) =>
      t.query(internal.emailContent.ticketEmailDocument, {
        registrationId: await createBookingFixture(t, eventId),
        hasPdf: true,
      }),
    ),
  )

  expect(documents.map((d) => d.subject)).toEqual([
    '26 Settembre – Maestri d’Acciaio. La tua prenotazione è confermata!',
    'Ticket per Maestri d’Acciaio',
    'Ticket per Maestri d’Acciaio',
  ])
})

test('ticketEmailDocument appends the booking summary built from the booking’s current people', async () => {
  const t = convexTest(schema, modules)
  // «Raccolta nomi» disattiva: Figli e Ospiti portano l'Etichetta posizionale.
  const eventId = await createEventFixture(t, {
    collectNames: false,
    emailBody: 'Grazie per la tua prenotazione!\n\nA prestissimo!',
  })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      { name: 'Mario Rossi', category: 'user', allergies: 'Glutine', ticketCode: 'ABC-123' },
      { name: 'Figlio 1', category: 'child', age: 8, ticketCode: 'DEF-456' },
      { name: 'Ospite 1', category: 'companion', ticketCode: 'GHI-789' },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
    hasPdf: true,
  })

  expect(document.contactEmail).toBe('utente@example.com')
  expect(document.markdown).toBe(
    [
      'Grazie per la tua prenotazione!',
      '',
      'A prestissimo!',
      '',
      '---',
      '',
      '## Riepilogo della prenotazione',
      '',
      '- **Mario Rossi** — Iscritto',
      '  - Biglietto: `ABC-123`',
      '  - Allergie e intolleranze: Glutine',
      '- **Figlio 1** · 8 anni',
      '  - Biglietto: `DEF-456`',
      '- **Ospite 1**',
      '  - Biglietto: `GHI-789`',
      '',
    ].join('\n'),
  )
})

test('ticketEmailDocument names the category of every person when the event collects names', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t, { collectNames: true, emailBody: 'Ciao!' })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      { name: 'Mario Rossi', category: 'user', ticketCode: 'ABC-123' },
      { name: 'Luca Rossi', category: 'child', age: 8, ticketCode: 'DEF-456' },
      { name: 'Anna Bianchi', category: 'companion', ticketCode: 'GHI-789' },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
    hasPdf: true,
  })

  expect(document.markdown).toContain('- **Mario Rossi** — Iscritto')
  expect(document.markdown).toContain('- **Luca Rossi** — Figlio · 8 anni')
  expect(document.markdown).toContain('- **Anna Bianchi** — Ospite')
})

test('ticketEmailDocument falls back to today’s wording when the event has no body', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t, { title: 'Evento test', location: 'Roma' })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [{ name: 'Mario Rossi', category: 'user', ticketCode: 'ABC-123' }],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
    hasPdf: true,
  })

  expect(document.markdown).toBe(
    [
      '# I vostri QR sono pronti',
      '',
      '## Evento test',
      '',
      '**Dove:** Roma',
      '',
      'Ogni persona ha un proprio QR code, nel **PDF dei biglietti** in allegato: una pagina per persona, pronta da stampare. Presentatelo all’ingresso e a ogni attività prenotata.',
      '',
      '---',
      '',
      '## Riepilogo della prenotazione',
      '',
      '- **Mario Rossi** — Iscritto',
      '  - Biglietto: `ABC-123`',
      '',
    ].join('\n'),
  )
})

test('ticketEmailDocument stops promising a QR when the fallback body ships without the PDF', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t)
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [{ name: 'Mario Rossi', category: 'user', ticketCode: 'ABC-123' }],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
    hasPdf: false,
  })

  // Senza allegato il QR non è da nessuna parte nell'email: prometterlo
  // sarebbe falso, e all'Utente resta il codice del Riepilogo.
  expect(document.markdown).not.toContain('PDF dei biglietti')
  expect(document.markdown).not.toContain('QR code')
  expect(document.markdown).toContain(
    'Ogni persona ha un proprio biglietto. Presentate il codice qui sotto all\u2019ingresso e a ogni attività prenotata.',
  )
})

test('ticketEmailDocument neutralises markdown and HTML written by the user', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t, { collectNames: true, emailBody: 'Ciao!' })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      {
        name: 'Mario <b>Rossi</b>',
        category: 'user',
        allergies: 'niente *glutine*\ne niente [lattosio](http://x)',
        ticketCode: 'ABC-123',
      },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
    hasPdf: true,
  })

  expect(document.markdown).toContain('- **Mario \\<b\\>Rossi\\</b\\>** — Iscritto')
  // Le allergie arrivano su una riga sola: un a capo spezzerebbe l'elenco.
  expect(document.markdown).toContain(
    '  - Allergie e intolleranze: niente \\*glutine\\* e niente \\[lattosio\\](http://x)',
  )
})
