import { expect, test } from 'vitest'
import { presenceOf } from '../../lib/person-status'

/**
 * Presenze dell'Evento: una fotografia di dove sta ciascuna Persona, non una
 * storia dei passaggi. Ogni Persona entrata sta in una sola delle due colonne
 * («dentro adesso» o «uscita») e cambia colonna a ogni passaggio.
 */

function person(fields: {
  in?: [string, number, string]
  out?: [string, number, string]
}) {
  return {
    eventCheckInAt: fields.in?.[0] ?? null,
    eventCheckInCount: fields.in?.[1] ?? 0,
    eventCheckInLastAt: fields.in?.[2] ?? null,
    eventCheckOutAt: fields.out?.[0],
    eventCheckOutCount: fields.out?.[1],
    eventCheckOutLastAt: fields.out?.[2],
  }
}

test('chi non è mai entrato non conta da nessuna parte', () => {
  expect(presenceOf([person({})])).toEqual({ entered: 0, inside: 0, exited: 0 })
})

test('entrato e mai uscito è dentro', () => {
  const p = person({ in: ['2026-09-26T10:00:00.000Z', 1, '2026-09-26T10:00:00.000Z'] })
  expect(presenceOf([p])).toEqual({ entered: 1, inside: 1, exited: 0 })
})

test('entrato e uscito è uscito, non dentro', () => {
  const p = person({
    in: ['2026-09-26T10:00:00.000Z', 1, '2026-09-26T10:00:00.000Z'],
    out: ['2026-09-26T11:00:00.000Z', 1, '2026-09-26T11:00:00.000Z'],
  })
  expect(presenceOf([p])).toEqual({ entered: 1, inside: 0, exited: 1 })
})

test('rientrato dopo un’uscita torna dentro e conta una volta sola', () => {
  const p = person({
    in: ['2026-09-26T10:00:00.000Z', 2, '2026-09-26T12:00:00.000Z'],
    out: ['2026-09-26T11:00:00.000Z', 1, '2026-09-26T11:00:00.000Z'],
  })
  expect(presenceOf([p])).toEqual({ entered: 1, inside: 1, exited: 0 })
})

test('a parità di istante l’uscita vince', () => {
  const p = person({
    in: ['2026-09-26T10:00:00.000Z', 1, '2026-09-26T10:00:00.000Z'],
    out: ['2026-09-26T10:00:00.000Z', 1, '2026-09-26T10:00:00.000Z'],
  })
  expect(presenceOf([p])).toEqual({ entered: 1, inside: 0, exited: 1 })
})

test('righe pre-#38 senza campi d’uscita: entrato vale dentro', () => {
  const p = {
    eventCheckInAt: '2026-09-26T10:00:00.000Z',
    eventCheckInCount: 1,
    eventCheckInLastAt: '2026-09-26T10:00:00.000Z',
  }
  expect(presenceOf([p])).toEqual({ entered: 1, inside: 1, exited: 0 })
})

test('dentro + uscite = entrate su un gruppo misto', () => {
  const persons = [
    person({}),
    person({ in: ['2026-09-26T10:00:00.000Z', 1, '2026-09-26T10:00:00.000Z'] }),
    person({
      in: ['2026-09-26T10:00:00.000Z', 1, '2026-09-26T10:00:00.000Z'],
      out: ['2026-09-26T11:00:00.000Z', 1, '2026-09-26T11:00:00.000Z'],
    }),
    person({
      in: ['2026-09-26T10:00:00.000Z', 2, '2026-09-26T12:00:00.000Z'],
      out: ['2026-09-26T11:00:00.000Z', 1, '2026-09-26T11:00:00.000Z'],
    }),
  ]
  expect(presenceOf(persons)).toEqual({ entered: 3, inside: 2, exited: 1 })
})
