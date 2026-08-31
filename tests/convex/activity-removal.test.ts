import { expect, test } from 'vitest'
import { activityRemovalWarning } from '../../lib/activity-removal'

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
