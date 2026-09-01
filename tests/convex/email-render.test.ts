// @vitest-environment node
//
// Il documento composto passato per `emailmd`, il motore vero.
// Gira in ambiente node — non `edge-runtime` come il resto della cartella —
// perché `emailmd` porta con sé MJML, e l'action che lo usa è `'use node'`.

import { render } from 'emailmd'
import { expect, test } from 'vitest'
import { buildTicketsEmailMarkdown, type EmailSummaryPerson } from '../../lib/email-content'

const personFor = (person: {
  firstName: string
  lastName: string
  allergies: string | null
}): EmailSummaryPerson => ({
  firstName: person.firstName,
  lastName: person.lastName,
  nameProvided: true,
  category: 'user',
  age: null,
  allergies: person.allergies,
  ticketCode: 'ABC-123',
})

const markdownFor = (
  person: { firstName: string; lastName: string; allergies: string | null },
  options: { emailBody?: string; showSummary?: boolean } = {},
) =>
  buildTicketsEmailMarkdown({
    emailBody: options.emailBody ?? 'Grazie per la tua prenotazione!\n\nA prestissimo!',
    event: { title: 'Evento test', location: 'Roma' },
    persons: [personFor(person)],
    hasPdf: true,
    showSummary: options.showSummary ?? true,
  })

test('the rendered email carries an HTML part and a plain text alternative', async () => {
  const { html, text } = await render(
    markdownFor({ firstName: 'Mario', lastName: 'Rossi', allergies: 'Glutine' }),
  )

  expect(html).toContain('<!doctype html>')
  expect(html).toContain('Grazie per la tua prenotazione!')
  expect(html).toContain('<h2>Riepilogo della prenotazione</h2>')
  expect(html).toContain('<code>ABC-123</code>')

  expect(text).toContain('Grazie per la tua prenotazione!')
  expect(text).toContain('RIEPILOGO DELLA PRENOTAZIONE')
  expect(text).toContain('Biglietto: ABC-123')
  expect(text).toContain('Allergie e intolleranze: Glutine')
})

test('what the user wrote reaches the rendered email as text, never as markup', async () => {
  const { html, text } = await render(
    markdownFor({ firstName: 'Mario', lastName: '<b>Rossi</b>', allergies: 'niente *glutine*' }),
  )

  // Il tag arriva a schermo come tag, non come grassetto.
  expect(html).toContain('Mario &lt;b&gt;Rossi&lt;/b&gt;')
  expect(html).not.toContain('<b>Rossi</b>')
  // Gli asterischi restano asterischi: nessun corsivo rubato al markdown.
  expect(html).toContain('niente *glutine*')
  expect(html).not.toContain('<em>glutine</em>')
  // E nella parte testuale il lettore rivede esattamente ciò che ha dichiarato.
  expect(text).toContain('Mario <b>Rossi</b>')
  expect(text).toContain('niente *glutine*')
})

test('the name substituted for a Segnaposto reaches the rendered email as text, never as markup', async () => {
  const { html, text } = await render(
    markdownFor(
      { firstName: 'M*a*rio', lastName: '<b>Rossi</b>', allergies: null },
      { emailBody: 'Gentile {{nome}} {{cognome}},\n\ngrazie per la tua registrazione.' },
    ),
  )

  expect(html).toContain('Gentile M*a*rio &lt;b&gt;Rossi&lt;/b&gt;,')
  expect(html).not.toContain('<em>')
  expect(html).not.toContain('<b>Rossi</b>')
  expect(html).not.toContain('{{')
  expect(text).toContain('Gentile M*a*rio <b>Rossi</b>,')
})

test('with the summary switched off the rendered email is the body alone', async () => {
  const { html, text } = await render(
    markdownFor({ firstName: 'Mario', lastName: 'Rossi', allergies: 'Glutine' }, { showSummary: false }),
  )

  expect(html).toContain('Grazie per la tua prenotazione!')
  expect(html).not.toContain('Riepilogo della prenotazione')
  expect(html).not.toContain('ABC-123')
  expect(text).not.toContain('RIEPILOGO')
  expect(text).not.toContain('Glutine')
})
