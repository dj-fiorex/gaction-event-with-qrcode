import type { ParticipantGroup } from '@/convex/checkins'

/** Minuscole e senza accenti: «Niccolò» si trova scrivendo «niccolo». */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Ricerca nell'Elenco partecipanti. Ogni parola deve comparire da qualche
 * parte nel gruppo — nome, cognome ed email dell'Utente, o il nome dichiarato
 * di un Figlio o Ospite — e basta una corrispondenza perché compaia tutto il
 * gruppo: un «Ospite 1» da solo non dice di chi è ospite. Le Etichette
 * posizionali non si cercano: «figlio» troverebbe tutti i figli dell'Evento.
 */
export function filterParticipants(groups: ParticipantGroup[], search: string): ParticipantGroup[] {
  const terms = normalize(search).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return groups
  return groups.filter((group) => {
    const haystack = normalize(
      [
        group.contactEmail,
        ...group.persons
          .filter((p) => p.category === 'user' || p.nameProvided)
          .map((p) => `${p.firstName} ${p.lastName ?? ''}`),
      ].join(' '),
    )
    return terms.every((term) => haystack.includes(term))
  })
}
