import { expect, test } from 'vitest'
import { MissingColumnsError, parseResponses } from '../../lib/import-responses'

/* ------------------------------------------------------------------ *
 * File di risposte (ADR 0020): il tracciato fisso del modulo esterno.
 * ------------------------------------------------------------------ */

const HEADERS = {
  date: 'Submission Date',
  firstName: 'Nome',
  lastName: 'Cognome',
  email: 'Email aziendale (se disponibile)',
  participates: "Vuoi partecipare all'evento?",
  hasChildren: 'Hai figli minorenni che parteciperanno con te?',
  childrenCount: 'Quanti figli minorenni parteciperanno con te? (massimo 5)',
  age1: 'Età del figlio 1',
  age2: 'Età del figlio 2',
  age3: 'Età del figlio 3',
  age4: 'Età del figlio 4',
  age5: 'Età del figlio 5',
  companionYesNo: 'Verrai con un familiare adulto?',
  companionCount: 'Quanti familiari adulti verranno con te?',
  notes: 'Hai note o esigenze particolari da segnalare?',
  terms: 'Terms and Conditions',
}

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    [HEADERS.date]: 'lug 14, 2026',
    [HEADERS.firstName]: 'Dalila',
    [HEADERS.lastName]: 'Ancona',
    [HEADERS.email]: 'd.ancona@acciaivender.it',
    [HEADERS.participates]: 'Si',
    [HEADERS.terms]: 'Accettata',
    ...overrides,
  }
}

test('un «sì» con due età e un familiare adulto diventa una risposta con due Figli e un Ospite', () => {
  const result = parseResponses([
    row({
      [HEADERS.hasChildren]: 'Si',
      [HEADERS.childrenCount]: '2',
      [HEADERS.age1]: '4',
      [HEADERS.age2]: '1',
      [HEADERS.companionYesNo]: 'Sì, con 1 familiare adulto',
      [HEADERS.notes]: 'Arriviamo con due passeggini.',
    }),
  ])

  expect(result.unreadable).toEqual([])
  expect(result.responses).toEqual([
    {
      row: 2,
      firstName: 'Dalila',
      lastName: 'Ancona',
      email: 'd.ancona@acciaivender.it',
      participates: true,
      childrenAges: [4, 1],
      companionsCount: 1,
      notes: 'Arriviamo con due passeggini.',
    },
  ])
})

test('un «no» è una risposta che non partecipa, con la sua nota', () => {
  const { responses } = parseResponses([
    row({
      [HEADERS.participates]: 'No',
      [HEADERS.notes]: 'Mi dispiace non esserci, motivi familiari.',
    }),
  ])
  expect(responses[0]).toMatchObject({
    participates: false,
    childrenAges: [],
    companionsCount: 0,
    notes: 'Mi dispiace non esserci, motivi familiari.',
  })
})

test('i familiari adulti si leggono da una qualsiasi delle due colonne del modulo', () => {
  const cases: Array<[Record<string, unknown>, number]> = [
    [{ [HEADERS.companionCount]: '1 familiare adulto' }, 1],
    [{ [HEADERS.companionCount]: '2 familiari adulti' }, 2],
    [{ [HEADERS.companionCount]: 'Nessuno' }, 0],
    [{ [HEADERS.companionYesNo]: 'Sì, con 1 familiare adulto' }, 1],
    [{ [HEADERS.companionYesNo]: 'No' }, 0],
    [{}, 0],
  ]
  for (const [cells, expected] of cases) {
    const { responses, unreadable } = parseResponses([row(cells)])
    expect(unreadable).toEqual([])
    expect(responses[0].companionsCount).toBe(expected)
  }
})

test('le età vincono sul conteggio dei figli e seguono il numero della colonna', () => {
  const { responses } = parseResponses([
    row({
      [HEADERS.childrenCount]: '1',
      // Colonne in ordine sparso: Figlio 1 resta il primo.
      [HEADERS.age3]: '8',
      [HEADERS.age1]: 7,
    }),
  ])
  expect(responses[0].childrenAges).toEqual([7, 8])
})

test('una riga che non si capisce si riporta e non ferma le altre', () => {
  const { responses, unreadable } = parseResponses([
    row({ [HEADERS.participates]: 'Forse' }),
    row({ [HEADERS.firstName]: '', [HEADERS.lastName]: 'Rossi' }),
    row({ [HEADERS.email]: '  ' }),
    row({ [HEADERS.age1]: 'tre' }),
    row({ [HEADERS.email]: 'ok@example.com' }),
  ])
  expect(responses.map((r) => r.email)).toEqual(['ok@example.com'])
  expect(unreadable.map((u) => u.row)).toEqual([2, 3, 4, 5])
  expect(unreadable[0]).toEqual({
    row: 2,
    name: 'Dalila Ancona',
    reason: 'Risposta a «Vuoi partecipare?» non riconosciuta',
  })
})

test('senza le colonne che fanno una risposta il file è sbagliato, e lo dice prima di leggere', () => {
  expect(() =>
    parseResponses([{ Nome: 'Dalila', Cognome: 'Ancona', 'Submission Date': 'x' }]),
  ).toThrow(MissingColumnsError)
  try {
    parseResponses([{ Nome: 'Dalila' }])
  } catch (error) {
    expect((error as MissingColumnsError).columns).toEqual([
      'Cognome',
      'Email',
      'Vuoi partecipare all’evento?',
    ])
  }
})

test('le intestazioni si riconoscono a prescindere da maiuscole, spazi e colonne in più', () => {
  const { responses } = parseResponses([
    {
      '  NOME ': 'Luca',
      Cognome: 'Bianchi',
      Email: 'luca@example.com',
      'Vuoi partecipare  all’evento? ': 'SÌ',
      'Colonna inventata': 'ignorata',
    },
  ])
  expect(responses).toHaveLength(1)
  expect(responses[0]).toMatchObject({ firstName: 'Luca', participates: true })
})

test('un «no» si legge anche se le colonne dei figli portano un refuso', () => {
  const { responses, unreadable } = parseResponses([
    row({ [HEADERS.participates]: 'No', [HEADERS.age1]: 'tre', [HEADERS.notes]: 'Non ci sarò.' }),
  ])
  expect(unreadable).toEqual([])
  expect(responses[0]).toMatchObject({ participates: false, notes: 'Non ci sarò.' })
})

test('un foglio senza righe è vuoto, non sbagliato', () => {
  expect(parseResponses([])).toEqual({ responses: [], unreadable: [] })
})
