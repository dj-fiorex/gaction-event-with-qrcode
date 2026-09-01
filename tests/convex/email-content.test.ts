/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'

import { applyPlaceholders, buildTicketsEmailMarkdown } from '../../lib/email-content'

const modules = import.meta.glob('../../convex/**/*.ts')

async function createEventFixture(
  t: ReturnType<typeof convexTest>,
  {
    title = 'Evento test',
    location = 'Roma',
    collectNames,
    emailSubject,
    emailBody,
    emailShowSummary,
  }: {
    title?: string
    location?: string
    /** Omesso = campo assente (l'app lo tratta come «Raccolta nomi» attiva). */
    collectNames?: boolean
    /** Omesso = campo assente (l'app ripiega sull'oggetto odierno). */
    emailSubject?: string
    /** Omesso = campo assente (l'app ripiega sul corpo odierno). */
    emailBody?: string
    /** Omesso = campo assente (il Riepilogo si vede, come prima dell'interruttore). */
    emailShowSummary?: boolean
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
      ...(emailShowSummary === undefined ? {} : { emailShowSummary }),
    }),
  )
}

interface PersonFixture {
  firstName: string
  /** Omesso = nessun cognome, come per Figli, Ospiti ed Etichette posizionali. */
  lastName?: string
  /** Omesso = nome dichiarato da chi prenota (ADR 0017). */
  nameProvided?: boolean
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
        firstName: person.firstName,
        ...(person.lastName === undefined ? {} : { lastName: person.lastName }),
        nameProvided: person.nameProvided ?? true,
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
    t.query(internal.emailContent.ticketEmailDocument, { registrationId }),
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
  // Prenotazione fatta con «Raccolta nomi» disattiva: Figli e Ospiti portano
  // l'Etichetta posizionale, e la riga se lo ricorda con `nameProvided: false`.
  const eventId = await createEventFixture(t, {
    collectNames: false,
    emailBody: 'Grazie per la tua prenotazione!\n\nA prestissimo!',
  })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      {
        firstName: 'Mario',
        lastName: 'Rossi',
        category: 'user',
        allergies: 'Glutine',
        ticketCode: 'ABC-123',
      },
      {
        firstName: 'Figlio 1',
        nameProvided: false,
        category: 'child',
        age: 8,
        ticketCode: 'DEF-456',
      },
      {
        firstName: 'Ospite 1',
        nameProvided: false,
        category: 'companion',
        ticketCode: 'GHI-789',
      },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
  })

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
      { firstName: 'Mario', lastName: 'Rossi', category: 'user', ticketCode: 'ABC-123' },
      { firstName: 'Luca Rossi', category: 'child', age: 8, ticketCode: 'DEF-456' },
      { firstName: 'Anna Bianchi', category: 'companion', ticketCode: 'GHI-789' },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
  })

  expect(document.markdown).toContain('- **Mario Rossi** — Iscritto')
  expect(document.markdown).toContain('- **Luca Rossi** — Figlio · 8 anni')
  expect(document.markdown).toContain('- **Anna Bianchi** — Ospite')
})

test('ticketEmailDocument falls back to today’s wording when the event has no body', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t, { title: 'Evento test', location: 'Roma' })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      { firstName: 'Mario', lastName: 'Rossi', category: 'user', ticketCode: 'ABC-123' },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
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

test('il corpo di ripiego smette di promettere il QR quando non c’è allegato', () => {
  // La query non passa più per questo ramo: da quando il PDF si renderizza
  // server-side l'allegato non è più best-effort, e senza di lui la Consegna si
  // chiude «non riuscita» invece di spedire un'email monca (ADR 0015). La
  // regola di composizione resta però del lib, e qui si prova là.
  const markdown = buildTicketsEmailMarkdown({
    emailBody: undefined,
    event: { title: 'Maestri d’Acciaio', location: 'Brescia' },
    persons: [
      {
        firstName: 'Mario',
        lastName: 'Rossi',
        nameProvided: true,
        category: 'user',
        age: null,
        allergies: null,
        ticketCode: 'ABC-123',
      },
    ],
    hasPdf: false,
    showSummary: true,
  })

  // Senza allegato il QR non è da nessuna parte nell'email: prometterlo
  // sarebbe falso, e all'Utente resta il codice del Riepilogo.
  expect(markdown).not.toContain('PDF dei biglietti')
  expect(markdown).not.toContain('QR code')
  expect(markdown).toContain(
    'Ogni persona ha un proprio biglietto. Presentate il codice qui sotto all\u2019ingresso e a ogni attività prenotata.',
  )
})

test('ticketEmailDocument neutralises markdown and HTML written by the user', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t, { collectNames: true, emailBody: 'Ciao!' })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      {
        firstName: 'Mario',
        lastName: '<b>Rossi</b>',
        category: 'user',
        allergies: 'niente *glutine*\ne niente [lattosio](http://x)',
        ticketCode: 'ABC-123',
      },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
  })

  expect(document.markdown).toContain('- **Mario \\<b\\>Rossi\\</b\\>** — Iscritto')
  // Le allergie arrivano su una riga sola: un a capo spezzerebbe l'elenco.
  expect(document.markdown).toContain(
    '  - Allergie e intolleranze: niente \\*glutine\\* e niente \\[lattosio\\](http://x)',
  )
})

/* ------------------------------------------------------------------ */
/* Riepilogo spegnibile per Evento                                      */
/* ------------------------------------------------------------------ */

test('a Riepilogo spento l’email è il solo Testo, e i codici restano nel PDF', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t, {
    emailBody: 'Grazie per la tua prenotazione!\n\nA prestissimo!',
    emailShowSummary: false,
  })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      {
        firstName: 'Mario',
        lastName: 'Rossi',
        category: 'user',
        allergies: 'Glutine',
        ticketCode: 'ABC-123',
      },
      { firstName: 'Figlio 1', nameProvided: false, category: 'child', age: 8, ticketCode: 'DEF-456' },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, { registrationId })

  expect(document.markdown).toBe('Grazie per la tua prenotazione!\n\nA prestissimo!\n')
  expect(document.markdown).not.toContain('Riepilogo')
  expect(document.markdown).not.toContain('ABC-123')
  // Le allergie di quell'Evento restano leggibili solo in admin.
  expect(document.markdown).not.toContain('Glutine')
  // Il PDF le Persone le porta tutte, come prima: è lì che vivono i QR.
  expect(document.pdf.persons.map((p) => p.ticketCode)).toEqual(['ABC-123', 'DEF-456'])
  expect(document.personsCount).toBe(2)
})

test('il Riepilogo si vede quando l’interruttore è acceso e quando l’Evento non ce l’ha', async () => {
  const t = convexTest(schema, modules)
  const explicit = await createEventFixture(t, { emailBody: 'Ciao!', emailShowSummary: true })
  const legacy = await createEventFixture(t, { emailBody: 'Ciao!' })

  const documents = await Promise.all(
    [explicit, legacy].map(async (eventId) =>
      t.query(internal.emailContent.ticketEmailDocument, {
        registrationId: await createBookingFixture(t, eventId, {
          persons: [{ firstName: 'Mario', lastName: 'Rossi', category: 'user', ticketCode: 'ABC-123' }],
        }),
      }),
    ),
  )

  for (const document of documents) {
    expect(document.markdown).toContain('## Riepilogo della prenotazione')
    expect(document.markdown).toContain('`ABC-123`')
  }
})

/* ------------------------------------------------------------------ */
/* Segnaposto: {{nome}} e {{cognome}} dell'Utente                       */
/* ------------------------------------------------------------------ */

test('ticketEmailDocument sostituisce i Segnaposto con nome e cognome dell’Utente, neutralizzati', async () => {
  const t = convexTest(schema, modules)
  const eventId = await createEventFixture(t, {
    emailBody: 'Gentile {{nome}} {{ Cognome }},\n\ngrazie per la tua registrazione.',
    emailShowSummary: false,
  })
  // Il Figlio viene prima dell'Utente in tabella: il Segnaposto deve cercare
  // la categoria, non prendere la prima riga.
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      { firstName: 'Luca', category: 'child', age: 8, ticketCode: 'DEF-456' },
      { firstName: 'Mario', lastName: '<b>Rossi</b>', category: 'user', ticketCode: 'ABC-123' },
    ],
  })

  const document = await t.query(internal.emailContent.ticketEmailDocument, { registrationId })

  expect(document.markdown).toBe(
    'Gentile Mario \\<b\\>Rossi\\</b\\>,\n\ngrazie per la tua registrazione.\n',
  )
  expect(document.markdown).not.toContain('Luca')
  expect(document.markdown).not.toContain('{{')
})

test('applyPlaceholders lascia intatto ciò che non è un Segnaposto, e senza Utente li toglie', () => {
  const utente = { firstName: 'Mario', lastName: 'Rossi' }

  // Solo le due parole, in qualunque maiuscola e con spazi dentro le graffe.
  expect(applyPlaceholders('{{nome}} {{NOME}} {{ cognome }} {{Cognome}}', utente)).toBe(
    'Mario Mario Rossi Rossi',
  )
  // Un token sconosciuto passa intatto: è il contratto di emailmd, e chi lo
  // legge nell'email lo vede — meglio di una sostituzione inventata.
  expect(applyPlaceholders('Ciao {{evento}} e {{ nome cognome }}', utente)).toBe(
    'Ciao {{evento}} e {{ nome cognome }}',
  )
  // Il valore non è mai interpretato come pattern di `replace` («$&» sarebbe
  // il testo trovato) né come markdown: la `&` esce neutralizzata come nel
  // Riepilogo, e il rendering la restituisce com'era.
  expect(applyPlaceholders('{{nome}}', { firstName: '$& *Mario*', lastName: null })).toBe(
    '$\\& \\*Mario\\*',
  )
  // Senza Utente i Segnaposto spariscono invece di arrivare in chiaro.
  expect(applyPlaceholders('Gentile {{nome}} {{cognome}},', undefined)).toBe('Gentile  ,')
})

test('il corpo di ripiego non conosce Segnaposto e il Riepilogo non li sostituisce', () => {
  const persons = [
    {
      firstName: 'Mario',
      lastName: 'Rossi',
      nameProvided: true,
      category: 'user' as const,
      age: null,
      allergies: 'scrivere {{nome}} qui non fa niente',
      ticketCode: 'ABC-123',
    },
  ]
  const markdown = buildTicketsEmailMarkdown({
    emailBody: undefined,
    event: { title: 'Evento {{nome}}', location: 'Roma' },
    persons,
    hasPdf: true,
    showSummary: true,
  })

  // Il titolo dell'Evento e le allergie sono testo, non template: un `{{nome}}`
  // scritto lì resta com'è (e neutralizzato dove serve).
  expect(markdown).toContain('## Evento {{nome}}')
  expect(markdown).toContain('Allergie e intolleranze: scrivere {{nome}} qui non fa niente')
})

/* ------------------------------------------------------------------ */
/* ADR 0017: il Riepilogo legge la riga, non l'impostazione dell'Evento */
/* ------------------------------------------------------------------ */

test('spegnere la Raccolta nomi dopo una Prenotazione non trasforma i nomi in etichette', async () => {
  const t = convexTest(schema, modules)
  // Prenotazione fatta con la Raccolta nomi attiva: i nomi sono dichiarati.
  const eventId = await createEventFixture(t, { collectNames: true, emailBody: 'Ciao!' })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      { firstName: 'Mario', lastName: 'Rossi', category: 'user', ticketCode: 'ABC-123' },
      { firstName: 'Luca Rossi', category: 'child', age: 8, ticketCode: 'DEF-456' },
    ],
  })

  // L'admin la spegne dopo. Prima di ADR 0017 il Riepilogo rileggeva
  // `collectNames` e stampava «**Luca Rossi**» come se fosse un'Etichetta
  // posizionale: un nome vero presentato come un numero d'ordine.
  await t.run((ctx) => ctx.db.patch(eventId, { collectNames: false }))

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
  })

  expect(document.markdown).toContain('- **Mario Rossi** — Iscritto')
  expect(document.markdown).toContain('- **Luca Rossi** — Figlio · 8 anni')
})

test('accendere la Raccolta nomi dopo una Prenotazione non promuove le etichette a nomi', async () => {
  const t = convexTest(schema, modules)
  // Il verso opposto: iscrizioni anonime, poi l'impostazione si accende.
  const eventId = await createEventFixture(t, { collectNames: false, emailBody: 'Ciao!' })
  const registrationId = await createBookingFixture(t, eventId, {
    persons: [
      { firstName: 'Mario', lastName: 'Rossi', category: 'user', ticketCode: 'ABC-123' },
      {
        firstName: 'Ospite 1',
        nameProvided: false,
        category: 'companion',
        ticketCode: 'GHI-789',
      },
    ],
  })

  await t.run((ctx) => ctx.db.patch(eventId, { collectNames: true }))

  const document = await t.query(internal.emailContent.ticketEmailDocument, {
    registrationId,
  })

  // «**Ospite 1** — Ospite» direbbe due volte la stessa cosa: l'Etichetta
  // resta sola perché la riga si ricorda di essere stata generata.
  expect(document.markdown).toContain('- **Ospite 1**\n')
  expect(document.markdown).not.toContain('**Ospite 1** — Ospite')
})
