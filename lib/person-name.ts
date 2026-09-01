/**
 * Come si scrive il nome di una Persona (ADR 0017).
 *
 * Nome e cognome vivono in due campi separati — sulla riga, nei validator e nei
 * DTO — e non vengono mai ricomposti prima di arrivare qui: questo modulo è il
 * solo posto che sa in che ordine si scrivono e cosa succede quando il cognome
 * non c'è. Stesso ruolo che `resolveEventDates` ha per le date dell'Evento.
 */

/** Persona ridotta ai due campi del nome, come la porta ogni DTO. */
export interface NamedPerson {
  firstName: string
  /**
   * Cognome. Assente per Figli e Ospiti — il form non glielo chiede — e per le
   * Persone identificate da un'Etichetta posizionale, che un cognome non ce
   * l'hanno per costruzione.
   */
  lastName?: string | null
}

/**
 * Nome completo per la visualizzazione: **«Mario Rossi»**, mai «Rossi Mario».
 * Senza cognome resta il solo nome, senza spazi appesi — è il caso normale di
 * Figli, Ospiti ed Etichette posizionali, non un dato mancante da segnalare.
 */
export function fullName(person: NamedPerson): string {
  const last = person.lastName?.trim()
  const first = person.firstName.trim()
  return last ? `${first} ${last}` : first
}

/**
 * Spezza un nome scritto in un campo solo sul **primo spazio**: tutto ciò che
 * resta è cognome, perché i cognomi composti («De Luca», «Della Valle») sono
 * più comuni dei nomi composti scritti senza trattino.
 *
 * È un'euristica, e lo è dichiaratamente: serve solo a precompilare le due
 * caselle del form con il nome del Membro loggato, dove c'è un umano che le
 * rilegge prima di inviare. Non va usata per interpretare in blocco dati già
 * salvati, dove nessuno rivedrebbe l'esito.
 */
export function splitFullName(value: string): { firstName: string; lastName: string } {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  const separator = trimmed.indexOf(' ')
  if (separator === -1) return { firstName: trimmed, lastName: '' }
  return {
    firstName: trimmed.slice(0, separator),
    lastName: trimmed.slice(separator + 1),
  }
}
