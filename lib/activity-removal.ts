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

import { fromDatetimeLocalValue, formatTimeRange } from './format'
import { generateSlots } from './slots'

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

/** Un'Attività così come sta nel form: gli orari sono valori `datetime-local`. */
export interface FormActivity {
  /** Presente solo per le Attività già persistite (ADR 0008). */
  id?: string
  title: string
  start: string
  end: string
  slotDurationMinutes: number
  capacityPerSlot: number
  freeAccess?: boolean
}

/**
 * Ciò che il salvataggio farebbe sparire davvero, con l'impatto su chi
 * l'aveva prenotato (ADR 0008): un'Attività che il form non rimanda più, e
 * — per quelle che restano — le fasce prenotate che i nuovi orari, la nuova
 * Durata o l'accesso libero non generano più. Tutto il resto conserva la
 * propria identità e non ha nulla da segnalare: cambiare Raccolta nomi, il
 * Testo dell'email o il titolo non tocca nessuna selezione.
 */
export function lostSelections({
  initial,
  submitted,
  impact,
}: {
  /** Le Attività com'erano all'apertura del form. */
  initial: FormActivity[]
  /** Le Attività così come il form le sta per salvare. */
  submitted: FormActivity[]
  /** Il conteggio dal server: `undefined` finché non è arrivato. */
  impact: ActivityImpact[] | undefined
}): LostSelection[] {
  const impactById = new Map(impact?.map((i) => [i.activityId, i]))
  const submittedById = new Map(submitted.flatMap((a) => (a.id ? [[a.id, a] as const] : [])))

  const lost: LostSelection[] = []
  for (const before of initial) {
    if (!before.id) continue
    const activityImpact = impactById.get(before.id)
    const after = submittedById.get(before.id)

    if (!after) {
      lost.push({ label: `«${before.title}»`, impact: activityImpact })
      continue
    }
    if (!activityImpact) continue

    // Le finestre che l'Attività genererebbe salvando: una fascia prenotata
    // che non è più fra queste sparisce, e con lei le sue selezioni. Ad
    // accesso libero la finestra è una sola e larga quanto l'Attività (ADR
    // 0011): leggere lì Durata e capienza — che l'admin non vede nemmeno —
    // inventerebbe fasce che il salvataggio non creerà mai, e con loro un
    // avviso a ogni salvataggio, anche a orari intoccati.
    const windows = new Set(
      generateSlots(
        before.id,
        fromDatetimeLocalValue(after.start),
        fromDatetimeLocalValue(after.end),
        after.slotDurationMinutes,
        after.capacityPerSlot,
        after.freeAccess ?? false,
      ).map((slot) => `${slot.start}|${slot.end}`),
    )
    for (const slot of activityImpact.slots) {
      if (windows.has(`${slot.start}|${slot.end}`)) continue
      lost.push({
        label: `«${after.title}», fascia ${formatTimeRange(slot.start, slot.end)}`,
        impact: slot,
      })
    }
  }
  return lost
}
