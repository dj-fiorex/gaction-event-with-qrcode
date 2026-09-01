import { expect, test } from 'vitest'
import { childInputSchema, makeRegistrationSchema } from '../../lib/schemas'

/**
 * L'età di un Figlio nel form nasce vuota, non a zero: uno zero precompilato
 * è già valido, e chi non guardava il campo prenotava un neonato senza
 * accorgersene. Il campo è registrato con `valueAsNumber`, quindi una casella
 * non compilata arriva alla validazione come `NaN` — è quel caso a dover
 * fallire. Se qualcuno togliesse `valueAsNumber`, il vuoto tornerebbe a essere
 * la stringa vuota che `z.coerce.number()` converte in 0: questi test sono la
 * rete sotto quella regressione silenziosa.
 */
function ageIssue(age: unknown): string | null {
  const result = childInputSchema.safeParse({ firstName: 'Anna Rossi', age })
  return result.success ? null : result.error.issues[0].message
}

test('un’età non compilata è un errore, non uno zero', () => {
  expect(ageIssue(Number.NaN)).toBe('Inserisci l’età del figlio')
  expect(ageIssue(undefined)).toBe('Inserisci l’età del figlio')
  expect(ageIssue('')).not.toBeNull()
})

test('lo zero vale solo se qualcuno l’ha scritto davvero', () => {
  expect(ageIssue(0)).toBeNull()
  expect(ageIssue(7)).toBeNull()
  expect(ageIssue(17)).toBeNull()
})

test('un Figlio è minorenne: fuori da 0-17 la validazione respinge', () => {
  expect(ageIssue(18)).toBe('L’età deve essere inferiore a 18')
  expect(ageIssue(-1)).toBe('Età non valida')
  expect(ageIssue(3.5)).toBe('L’età deve essere un numero intero')
})

test('la Raccolta nomi disattiva allenta il nome, mai l’età', () => {
  const result = makeRegistrationSchema(false).safeParse({
    eventId: 'evento',
    userFirstName: 'Mario',
    userLastName: 'Rossi',
    contactEmail: 'mario@example.com',
    children: [{ firstName: '', age: Number.NaN }],
  })
  expect(result.success).toBe(false)
})
