import { expect, test } from 'vitest'
import {
  PENDING_STALE_MS,
  closureFor,
  deliveryNeedsAttention,
  providerErrorReason,
} from '../../lib/email-delivery'

/* ------------------------------------------------------------------ *
 * Scelta dell'esito (ADR 0016)
 * ------------------------------------------------------------------ *
 * «Rifiutata» e «non riuscita» non sono lo stesso fatto: la prima dice che
 * abbiamo chiesto e il provider ha detto no — di norma permanente, si corregge
 * l'indirizzo o la configurazione; la seconda che non siamo riusciti nemmeno a
 * chiedere, e lì ritentare identico ha senso. Prima `sendTickets` le collassava
 * entrambe in `{ delivered: false, simulated: false }`.
 */

test('un errore restituito dal provider è una consegna rifiutata, col suo motivo', () => {
  expect(
    closureFor({
      kind: 'provider-error',
      error: { name: 'validation_error', message: 'Domain not verified' },
    }),
  ).toEqual({ outcome: 'rejected', reason: 'validation_error: Domain not verified' })
})

test("un'eccezione è una consegna non riuscita: non siamo riusciti nemmeno a chiedere", () => {
  const closure = closureFor({ kind: 'threw', error: new Error('ECONNRESET') })
  expect(closure.outcome).toBe('failed')
  // Il motivo dice comunque *cosa* è successo: senza, «non riuscita» sarebbe
  // una riga muta e l'admin non saprebbe se ritentare ha senso.
  expect(closure.reason).toContain('ECONNRESET')
})

test('rifiutata e non riuscita non collassano nello stesso esito', () => {
  // È l'unica differenza pratica che questo enum compra, ed è la ragione per
  // cui esiste: cambia il consiglio che il pannello dà.
  expect(closureFor({ kind: 'provider-error', error: {} }).outcome).not.toBe(
    closureFor({ kind: 'threw', error: new Error('x') }).outcome,
  )
})

test('senza provider configurato la consegna è simulata, né riuscita né consegnata', () => {
  // Normale in sviluppo, guasto totale in produzione: per questo l'esito è suo
  // e mostra comunque l'icona in admin.
  expect(closureFor({ kind: 'no-provider' })).toEqual({
    outcome: 'simulated',
    reason: 'RESEND_API_KEY non configurata',
  })
})

test('una consegna accettata dal provider non porta alcun motivo', () => {
  // Non c'è niente da spiegare, e un campo riempito per simmetria sarebbe
  // rumore su ogni riga riuscita.
  expect(closureFor({ kind: 'accepted' })).toEqual({ outcome: 'delivered' })
})

test('un motivo lunghissimo non lascia comunque la riga senza esito', () => {
  const closure = closureFor({ kind: 'threw', error: 'y'.repeat(5000) })
  expect(closure.outcome).toBe('failed')
  expect(closure.reason!.length).toBeLessThanOrEqual(300)
})

/* ------------------------------------------------------------------ *
 * Motivo del rifiuto
 * ------------------------------------------------------------------ */

test('il motivo del rifiuto porta nome e messaggio del provider', () => {
  expect(
    providerErrorReason({ name: 'validation_error', message: 'The domain is not verified' }),
  ).toBe('validation_error: The domain is not verified')
})

test('un motivo parziale non inventa la parte mancante', () => {
  expect(providerErrorReason({ message: 'Quota exceeded' })).toBe('Quota exceeded')
  expect(providerErrorReason({ name: 'rate_limit_exceeded' })).toBe('rate_limit_exceeded')
})

test('un errore del provider senza forma riconoscibile resta comunque un motivo leggibile', () => {
  // Il campo esiste per far sapere all'admin *cosa* rispondere: un rifiuto
  // senza motivo sarebbe indistinguibile da un guasto nostro.
  expect(providerErrorReason(undefined)).toBe('Rifiuto senza motivo dal provider')
  expect(providerErrorReason({})).toBe('Rifiuto senza motivo dal provider')
})

test('il motivo è troncato: è una diagnostica, non un log', () => {
  const reason = providerErrorReason({ name: 'x', message: 'y'.repeat(1000) })
  expect(reason.length).toBeLessThanOrEqual(300)
})

/* ------------------------------------------------------------------ *
 * Soglia sul «in corso» (ADR 0016)
 * ------------------------------------------------------------------ *
 * La soglia vive in lettura e non in un cron: nessuna riga viene patchata in
 * uno stato «abbandonata», che affermerebbe una cosa che non sappiamo.
 */

test('una consegna riuscita non chiede attenzione', () => {
  const now = Date.now()
  expect(deliveryNeedsAttention({ outcome: 'delivered', startedAt: now }, now)).toBe(false)
})

test('rifiutata, non riuscita e simulata chiedono attenzione sempre', () => {
  const now = Date.now()
  for (const outcome of ['rejected', 'failed', 'simulated'] as const) {
    expect(deliveryNeedsAttention({ outcome, startedAt: now }, now)).toBe(true)
  }
})

test('una consegna in corso da poco non chiede attenzione: dura secondi', () => {
  const now = Date.now()
  expect(deliveryNeedsAttention({ outcome: 'pending', startedAt: now - 1_000 }, now)).toBe(false)
  expect(
    deliveryNeedsAttention({ outcome: 'pending', startedAt: now - PENDING_STALE_MS + 1 }, now),
  ).toBe(false)
})

test('una consegna in corso oltre la soglia chiede attenzione: l’action è morta a metà', () => {
  const now = Date.now()
  expect(deliveryNeedsAttention({ outcome: 'pending', startedAt: now - PENDING_STALE_MS }, now)).toBe(
    true,
  )
  expect(
    deliveryNeedsAttention({ outcome: 'pending', startedAt: now - 60 * 60 * 1000 }, now),
  ).toBe(true)
})

test('un orologio indietro rispetto alla riga non fa scattare la soglia', () => {
  const now = Date.now()
  expect(deliveryNeedsAttention({ outcome: 'pending', startedAt: now + 10_000 }, now)).toBe(false)
})

test('nessuna consegna registrata non è un allarme', () => {
  // Le Prenotazioni anteriori a questo lavoro non hanno righe (nessun
  // backfill): l'assenza non deve diventare duecento icone.
  expect(deliveryNeedsAttention(null, Date.now())).toBe(false)
})
