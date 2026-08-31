import { expect, test } from 'vitest'
import {
  DEFAULT_RESULT_TITLE,
  defaultResultBody,
  linkify,
  resultBody,
  resultClosing,
  resultTitle,
  toParagraphs,
} from '../../lib/result-content'

/* ------------------------------------------------------------------ *
 * Ripieghi (ADR 0014)
 * ------------------------------------------------------------------ */

test('titolo: vuoto o di soli spazi ripiega sulla formulazione odierna', () => {
  expect(resultTitle(undefined)).toBe(DEFAULT_RESULT_TITLE)
  expect(resultTitle('')).toBe(DEFAULT_RESULT_TITLE)
  expect(resultTitle('   ')).toBe(DEFAULT_RESULT_TITLE)
  expect(resultTitle('  Registrazione completata!  ')).toBe('Registrazione completata!')
})

test('corpo: con i biglietti accesi il ripiego è identico alla copy odierna', () => {
  expect(defaultResultBody({ personsCount: 1, showTickets: true })).toBe(
    'È stato generato 1 QR code. Mostralo all’ingresso o scarica il PDF.',
  )
  expect(defaultResultBody({ personsCount: 4, showTickets: true })).toBe(
    'Sono stati generati 4 QR code, uno per ogni persona. Scarica il PDF di riepilogo o quello singolo.',
  )
})

test('corpo: con i biglietti spenti il ripiego non promette il PDF singolo', () => {
  // «o quello singolo» sono i bottoni dentro le schede dei biglietti: senza la
  // griglia non esistono, e indicarli sarebbe una promessa falsa — la stessa
  // regola che `defaultEmailBody` applica a `hasPdf`.
  const many = defaultResultBody({ personsCount: 4, showTickets: false })
  expect(many).toBe('Sono stati generati 4 QR code, uno per ogni persona. Scarica il PDF dei biglietti.')
  expect(many).not.toContain('singolo')

  const one = defaultResultBody({ personsCount: 1, showTickets: false })
  expect(one).toBe('È stato generato 1 QR code. Scarica il PDF del biglietto.')
  // Con la griglia spenta non c'è più niente da «mostrare» a schermo.
  expect(one).not.toContain('Mostralo')
})

test('corpo: il conteggio concorda con il numero di Persone', () => {
  expect(defaultResultBody({ personsCount: 1, showTickets: true })).toContain('1 QR code.')
  expect(defaultResultBody({ personsCount: 2, showTickets: true })).toContain('2 QR code,')
})

test('corpo scritto dall’admin: vince sul ripiego e non guarda i biglietti', () => {
  const written = 'Grazie, ci vediamo il 26 settembre!'
  expect(resultBody(written, { personsCount: 4, showTickets: true })).toBe(written)
  expect(resultBody(written, { personsCount: 4, showTickets: false })).toBe(written)
  expect(resultBody('  ', { personsCount: 4, showTickets: true })).toBe(
    defaultResultBody({ personsCount: 4, showTickets: true }),
  )
})

test('chiusura: non ha ripiego, perché oggi quel blocco non esiste', () => {
  expect(resultClosing(undefined)).toBeNull()
  expect(resultClosing('')).toBeNull()
  expect(resultClosing('   ')).toBeNull()
  expect(resultClosing('Sarà una giornata speciale.')).toBe('Sarà una giornata speciale.')
})

/* ------------------------------------------------------------------ *
 * Paragrafi
 * ------------------------------------------------------------------ */

test('paragrafi: la riga vuota separa, l’a capo singolo resta dentro', () => {
  expect(toParagraphs('Primo\n\nSecondo')).toEqual(['Primo', 'Secondo'])
  expect(toParagraphs('Primo\nancora primo')).toEqual(['Primo\nancora primo'])
  expect(toParagraphs('Primo\r\n\r\nSecondo')).toEqual(['Primo', 'Secondo'])
  expect(toParagraphs('\n\n  \n\n')).toEqual([])
  expect(toParagraphs('Primo\n\n\n\nSecondo')).toEqual(['Primo', 'Secondo'])
})

/* ------------------------------------------------------------------ *
 * Autolink
 * ------------------------------------------------------------------ */

test('autolink: l’indirizzo del committente diventa un mailto', () => {
  expect(linkify('Scrivici a info@maestridacciaio.it')).toEqual([
    { kind: 'text', text: 'Scrivici a ' },
    {
      kind: 'link',
      text: 'info@maestridacciaio.it',
      href: 'mailto:info@maestridacciaio.it',
    },
  ])
})

test('autolink: la punteggiatura che chiude la frase resta fuori dal link', () => {
  const [, link] = linkify('Scrivici a info@maestridacciaio.it.')
  expect(link).toEqual({
    kind: 'link',
    text: 'info@maestridacciaio.it',
    href: 'mailto:info@maestridacciaio.it',
  })
  expect(linkify('Vai su https://maestridacciaio.it, poi torna')).toEqual([
    { kind: 'text', text: 'Vai su ' },
    { kind: 'link', text: 'https://maestridacciaio.it', href: 'https://maestridacciaio.it' },
    { kind: 'text', text: ', poi torna' },
  ])
})

test('autolink: una chiocciola che non è un indirizzo resta testo', () => {
  // Il dominio senza punto è il caso che separa un indirizzo da una menzione:
  // senza questo vincolo «@luca» diventerebbe un mailto rotto.
  for (const text of ['Chiedi a @luca', 'Scrivi a info@ oppure chiama', 'Costa 15.00 euro']) {
    expect(linkify(text)).toEqual([{ kind: 'text', text }])
  }
})

test('autolink: un testo senza link resta un unico segmento', () => {
  const text = 'Ti aspettiamo il 26 settembre alle 15.00.'
  expect(linkify(text)).toEqual([{ kind: 'text', text }])
})

test('autolink: più link nello stesso paragrafo', () => {
  expect(linkify('a@b.it e c@d.com')).toEqual([
    { kind: 'link', text: 'a@b.it', href: 'mailto:a@b.it' },
    { kind: 'text', text: ' e ' },
    { kind: 'link', text: 'c@d.com', href: 'mailto:c@d.com' },
  ])
})
