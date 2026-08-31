/**
 * Avviso di perdita delle selezioni (ADR 0008, issue #44).
 *
 * Togliere un'Attività dal form di modifica — o cambiarne orari e Durata fino
 * a spostarne le fasce — cancella le selezioni di chi l'aveva prenotata. «Si
 * cancella l'impegno, non il fatto»: la Prenotazione, le Persone, i biglietti
 * e i [[Check-in]] già registrati restano. L'admin deve leggere quante
 * Prenotazioni e quante Persone colpisce prima di salvare, ed è questo modulo
 * a scrivere quella frase una volta sola.
 */

/** Quanto pesa una sparizione su chi aveva prenotato. */
export interface RegistrationImpact {
  /** Prenotazioni con una selezione su ciò che sparisce. */
  registrations: number
  /** Persone di quelle Prenotazioni. */
  persons: number
}

/** L'impatto di un'Attività dell'Evento, fascia per fascia. */
export interface ActivityImpact extends RegistrationImpact {
  activityId: string
  /** Solo le fasce prenotate: sulle altre non c'è nulla da dire. */
  slots: Array<{ start: string; end: string } & RegistrationImpact>
}

/** Una cosa che sparisce salvando: un'Attività intera o una sua fascia. */
export interface LostSelection {
  /** Come nominarla all'admin, es. `«Laboratorio»` o `«Laboratorio», fascia 10:00 – 10:30`. */
  label: string
  /** Impatto noto. `undefined` finché il conteggio non è arrivato dal server. */
  impact: RegistrationImpact | undefined
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Il testo da mostrare all'admin prima di salvare, o `null` quando niente di
 * ciò che sparisce era prenotato (e quindi non c'è nulla da avvisare).
 */
export function activityRemovalWarning(lost: LostSelection[]): string | null {
  const lines = lost
    .filter((l) => (l.impact?.registrations ?? 0) > 0)
    .map(({ label, impact }) => {
      const registrations = plural(impact?.registrations ?? 0, 'prenotazione', 'prenotazioni')
      const persons = plural(impact?.persons ?? 0, 'persona', 'persone')
      return `• ${label}: ${registrations} (${persons})`
    })
  if (lines.length === 0) return null

  return [
    'Salvando, queste selezioni verranno eliminate perché ciò che prenotavano non esisterà più:',
    '',
    ...lines,
    '',
    'Le prenotazioni restano valide: le persone, i biglietti e i check-in già registrati non vengono toccati.',
    '',
    'Salvare comunque?',
  ].join('\n')
}
