import { expect, test } from 'vitest'
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../../lib/format'

/**
 * Il giro fra istante persistito e valore di `<input type="datetime-local">`
 * dev'essere esatto in qualunque fuso: è ciò che permette agli Slot di
 * riconoscersi per finestra oraria a ogni salvataggio (ADR 0008). Se l'andata
 * e il ritorno non si annullano, un Evento salvato senza modifiche sposta i
 * propri orari e perde le selezioni.
 */
test('istante → datetime-local → istante non sposta nulla', () => {
  for (const iso of [
    '2026-07-07T09:00:00.000Z',
    '2026-01-15T23:30:00.000Z',
    '2026-03-29T01:00:00.000Z',
    '2026-12-31T22:45:00.000Z',
  ]) {
    expect(fromDatetimeLocalValue(toDatetimeLocalValue(iso))).toBe(iso)
  }
})

test('un valore datetime-local diventa un istante assoluto', () => {
  // Con lo Z il server non deve più indovinare il fuso di chi ha digitato.
  expect(fromDatetimeLocalValue('2026-07-07T09:00')).toMatch(/Z$/)
})

test('un valore non interpretabile torna com’è, senza inventare una data', () => {
  expect(fromDatetimeLocalValue('')).toBe('')
  expect(fromDatetimeLocalValue('non-una-data')).toBe('non-una-data')
})
