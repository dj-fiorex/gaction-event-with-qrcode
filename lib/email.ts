/**
 * Trim + lowercase, solo per dedup dentro l'Evento (mai identity linking,
 * ADR 0003).
 *
 * Sta in `lib/` e non in `convex/model.ts` perché la usano tutte e due le
 * sponde: il server per applicare «Una sola risposta per email» (ADR 0005) e
 * il form per sapere se l'email che l'utente sta digitando è ancora quella già
 * risultata occupata (ADR 0022). Due copie divergerebbero, e divergerebbero in
 * silenzio — il bordo dove si romperebbero è uno spazio di troppo.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Controllo minimo di forma: la consegna vera resta responsabilità del provider. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Sta qui accanto a `normalizeEmail` e per la stessa ragione: la usano il
 * server (che rifiuta con un `ConvexError`) e lo zod del pannello admin (che
 * segna il campo in rosso). Pura di proposito — chi vuole l'eccezione la
 * costruisce di là, dove `ConvexError` è in casa.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}

/* ------------------------------------------------------------------ */
/* I testi di «Una sola risposta per email» (ADR 0005, 0023)           */
/* ------------------------------------------------------------------ */

/** Le due risposte self-service possibili a un Evento (ADR 0005). */
export type ResponseKind = 'registration' | 'decline'

/**
 * La **testa** del messaggio: dice il fatto. `null` = «una risposta c'è», senza
 * dire quale — è la sola forma che può uscire dall'anticipo del form, dove
 * nominare il ramo direbbe pubblicamente chi ha rinunciato (ADR 0022). Le altre
 * due vivono nei rifiuti di `register` e `decline`, che hanno già l'identità di
 * chi scrive, e nel report dell'Import, dove servono all'admin per capire quale
 * riga saltare.
 */
export function emailAlreadyUsedHead(kind: ResponseKind | null): string {
  if (kind === 'registration') {
    return 'Questa e-mail è già stata utilizzata per una registrazione a questo evento.'
  }
  if (kind === 'decline') return 'Questa e-mail ha già registrato una rinuncia a questo evento.'
  return 'Questa e-mail è già stata utilizzata per questo evento.'
}

/**
 * La **coda**: dice il rimedio, ed è una sola per tutte e tre le teste. Il
 * rimedio non dipende dal ramo — si scrive a chi organizza in entrambi i casi —
 * e una coda per ramo avrebbe moltiplicato per tre i punti in cui l'indirizzo
 * entra nel testo, cioè i punti che possono sbagliare.
 *
 * Senza [[E-mail dell'organizzatore]] resta la formulazione di sempre: dice
 * comunque che un rimedio esiste, ed è meglio di un vicolo cieco.
 */
export function emailAlreadyUsedTail(organizerEmail?: string | null): string {
  const address = organizerEmail?.trim()
  if (!address) return 'Per modificare la risposta invia un’e-mail all’organizzatore.'
  return `Per modificare la risposta scrivi a ${address}.`
}

/**
 * Testa + coda, che è la forma in cui il messaggio si legge su ogni superficie
 * rivolta a chi prenota: l'anticipo sotto il campo, l'avviso al [[Membro]], i
 * rifiuti di `register` e `decline`.
 *
 * L'unica superficie che prende la sola testa è il report delle righe saltate
 * dell'Import: lì chi legge **è** l'organizzatore, e la coda gli direbbe di
 * scrivere a se stesso.
 */
export function emailAlreadyUsedMessage(
  kind: ResponseKind | null,
  organizerEmail?: string | null,
): string {
  return `${emailAlreadyUsedHead(kind)} ${emailAlreadyUsedTail(organizerEmail)}`
}
