import { expect, test } from 'vitest'
import {
  activityRemovalWarning,
  lostSelections,
  type FormActivity,
} from '../../lib/activity-removal'
import { fromDatetimeLocalValue } from '../../lib/format'

test('nessun avviso quando non si toglie nessuna Attività', () => {
  expect(activityRemovalWarning([])).toBeNull()
})

test('nessun avviso per un’Attività senza Prenotazioni', () => {
  expect(
    activityRemovalWarning([
      { label: '«Laboratorio»', impact: { registrations: 0, persons: 0 } },
    ]),
  ).toBeNull()
})

test('l’avviso nomina Attività, Prenotazioni e Persone colpite', () => {
  const message = activityRemovalWarning([
    { label: '«Laboratorio»', impact: { registrations: 3, persons: 7 } },
  ])
  expect(message).toContain('Laboratorio')
  expect(message).toContain('3 prenotazioni (7 persone)')
})

test('una sola Prenotazione e una sola Persona restano al singolare', () => {
  const message = activityRemovalWarning([
    { label: '«Visita guidata»', impact: { registrations: 1, persons: 1 } },
  ])
  expect(message).toContain('1 prenotazione (1 persona)')
})

test('più cose tolte insieme sono elencate tutte, Attività e fasce', () => {
  const message = activityRemovalWarning([
    { label: '«Laboratorio»', impact: { registrations: 2, persons: 5 } },
    { label: '«Visita guidata», fascia 10:00 – 10:30', impact: { registrations: 1, persons: 3 } },
  ])
  expect(message).toContain('«Laboratorio»: 2 prenotazioni (5 persone)')
  expect(message).toContain('«Visita guidata», fascia 10:00 – 10:30: 1 prenotazione (3 persone)')
})

test('ciò che ha impatto ancora ignoto non entra nell’avviso (il form blocca il salvataggio finché non lo sa)', () => {
  expect(
    activityRemovalWarning([{ label: '«Laboratorio»', impact: undefined }]),
  ).toBeNull()
})

test('l’avviso rassicura che Prenotazioni e check-in restano', () => {
  const message = activityRemovalWarning([
    { label: '«Laboratorio»', impact: { registrations: 1, persons: 2 } },
  ])
  // «Si cancella l'impegno, non il fatto» (ADR 0008): l'admin deve leggere
  // che sparisce la selezione, non la Prenotazione.
  expect(message).toContain('selezion')
  expect(message).toContain('check-in')
})

/* ------------------------------------------------------------------ */
/* Che cosa sparisce davvero salvando                                  */
/* ------------------------------------------------------------------ */

/** L'Attività com'è nel form: orari locali, come li digita l'admin. */
function activity(overrides: Partial<FormActivity> = {}): FormActivity {
  return {
    id: 'act1',
    title: 'Visita guidata alla fabbrica',
    start: '2026-09-26T15:00',
    end: '2026-09-26T17:00',
    slotDurationMinutes: 30,
    capacityPerSlot: 10,
    freeAccess: false,
    ...overrides,
  }
}

/** Una fascia prenotata come la conta il server: istanti ISO. */
function bookedSlot(start: string, end: string) {
  return {
    start: fromDatetimeLocalValue(start),
    end: fromDatetimeLocalValue(end),
    registrations: 2,
    persons: 7,
  }
}

test('un’Attività ad accesso libero salvata com’è non perde nulla', () => {
  // La fascia è una sola e larga quanto l'Attività (ADR 0011): leggere Durata
  // e capienza, che l'admin non vede nemmeno, faceva comparire l'avviso a
  // ogni salvataggio — anche togliendo la spunta a Raccolta nomi.
  const free = activity({ freeAccess: true })
  expect(
    lostSelections({
      initial: [free],
      submitted: [free],
      impact: [
        {
          activityId: 'act1',
          registrations: 2,
          persons: 7,
          slots: [bookedSlot('2026-09-26T15:00', '2026-09-26T17:00')],
        },
      ],
    }),
  ).toEqual([])
})

test('un’Attività a fasce salvata com’è non perde nulla', () => {
  const scheduled = activity()
  expect(
    lostSelections({
      initial: [scheduled],
      submitted: [scheduled],
      impact: [
        {
          activityId: 'act1',
          registrations: 2,
          persons: 7,
          slots: [bookedSlot('2026-09-26T15:00', '2026-09-26T15:30')],
        },
      ],
    }),
  ).toEqual([])
})

test('l’Attività tolta dal form perde le sue selezioni', () => {
  const lost = lostSelections({
    initial: [activity()],
    submitted: [],
    impact: [{ activityId: 'act1', registrations: 2, persons: 7, slots: [] }],
  })
  expect(lost).toEqual([
    { label: '«Visita guidata alla fabbrica»', impact: { activityId: 'act1', registrations: 2, persons: 7, slots: [] } },
  ])
})

test('la fascia prenotata che i nuovi orari non generano più sparisce', () => {
  const lost = lostSelections({
    initial: [activity()],
    submitted: [activity({ start: '2026-09-26T16:00' })],
    impact: [
      {
        activityId: 'act1',
        registrations: 2,
        persons: 7,
        slots: [bookedSlot('2026-09-26T15:00', '2026-09-26T15:30')],
      },
    ],
  })
  expect(lost).toHaveLength(1)
  expect(lost[0].label).toContain('fascia')
  expect(lost[0].impact).toMatchObject({ registrations: 2, persons: 7 })
})

test('passare un’Attività prenotata ad accesso libero fa sparire le sue fasce', () => {
  const lost = lostSelections({
    initial: [activity()],
    submitted: [activity({ freeAccess: true })],
    impact: [
      {
        activityId: 'act1',
        registrations: 2,
        persons: 7,
        slots: [bookedSlot('2026-09-26T15:00', '2026-09-26T15:30')],
      },
    ],
  })
  expect(lost).toHaveLength(1)
})

test('un’Attività appena aggiunta non ha selezioni da perdere', () => {
  expect(
    lostSelections({
      initial: [],
      submitted: [activity({ id: undefined })],
      impact: [],
    }),
  ).toEqual([])
})
