/**
 * Esito della Prenotazione (ADR 0014): i testi della schermata che segue una
 * Prenotazione riuscita, e i loro ripieghi.
 *
 * Modulo puro — niente React, niente Convex — sul modello di
 * `lib/email-content.ts`: la regola che decide *quali parole* legge l'Utente
 * si rompe in silenzio, perché una promessa falsa non solleva eccezioni.
 * Qui è verificabile con un `expect`, dentro un componente richiederebbe di
 * montare la UI.
 *
 * A differenza del Testo dell'email di conferma questi campi **non** sono
 * markdown: l'unico motore in casa è `emailmd`, che rende email, e importarne
 * uno per la UI vorrebbe dire metterne il peso dentro un iframe servito su
 * siti di terzi per ottenere grassetti che nessuno ha chiesto. Il bisogno
 * reale è «vai a capo», più i link — l'indirizzo scritto nudo e, dove il
 * rimando sta dentro la frase, `[parole](indirizzo)`: una coppia di parentesi
 * letta a mano da `linkify`, non un motore.
 */

/**
 * Il titolo è un `h2` dentro un iframe stretto, non l'oggetto di un'email:
 * il tetto è più basso di quello di `emailSubject` (200) perché una riga che
 * non ci sta non è un testo lungo, è un titolo sbagliato. Corpo e chiusura
 * restano senza tetto, come `emailBody`.
 */
export const RESULT_TITLE_MAX = 120

/** Titolo di ripiego: la formulazione odierna, invariata. */
export const DEFAULT_RESULT_TITLE = 'Registrazione confermata'

/**
 * Corpo di ripiego: la formulazione odierna, con la **sola** clausola finale
 * condizionata alla presenza dei biglietti inline.
 *
 * È la stessa regola che `defaultEmailBody` applica a `hasPdf`: con la griglia
 * spenta i bottoni «Scarica PDF» per Persona non esistono, e «o quello
 * singolo» indicherebbe una cosa che non c'è. Un Evento che spegne i biglietti
 * l'ha deciso l'admin, quindi il ripiego non sta cambiando parole di sua
 * iniziativa — sta dicendo la verità sullo stato in cui si trova.
 */
export function defaultResultBody(opts: {
  personsCount: number
  showTickets: boolean
}): string {
  const { personsCount, showTickets } = opts
  const generated =
    personsCount === 1
      ? 'È stato generato 1 QR code.'
      : `Sono stati generati ${personsCount} QR code, uno per ogni persona.`

  if (!showTickets) {
    return personsCount === 1
      ? `${generated} Scarica il PDF del biglietto.`
      : `${generated} Scarica il PDF dei biglietti.`
  }
  return personsCount === 1
    ? `${generated} Mostralo all’ingresso o scarica il PDF.`
    : `${generated} Scarica il PDF di riepilogo o quello singolo.`
}

/**
 * Vuoto o di soli spazi = «non impostato». Stessa regola di
 * `normalizeEmailCopy`, ripetuta qui e non importata perché i due moduli non
 * si conoscono: `lib/email-content.ts` compone un documento markdown per la
 * posta, questo compone testo a schermo.
 */
function copyOrUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined
}

/** Titolo dell'Esito: quello dell'Evento se c'è, altrimenti il ripiego. */
export function resultTitle(value: string | undefined): string {
  return copyOrUndefined(value)?.trim() ?? DEFAULT_RESULT_TITLE
}

/** Corpo dell'Esito: quello dell'Evento se c'è, altrimenti il ripiego. */
export function resultBody(
  value: string | undefined,
  opts: { personsCount: number; showTickets: boolean },
): string {
  return copyOrUndefined(value) ?? defaultResultBody(opts)
}

/**
 * Chiusura dell'Esito. Non ha ripiego: è un blocco che oggi non esiste, e il
 * suo «comportamento odierno» è l'assenza. Vuota = niente da rendere.
 */
export function resultClosing(value: string | undefined): string | null {
  return copyOrUndefined(value) ?? null
}

/**
 * Paragrafi: una riga vuota li separa. Gli a capo singoli restano dentro il
 * paragrafo e li rende il CSS (`whitespace-pre-line`), così chi scrive un
 * indirizzo su tre righe ottiene tre righe senza dover imparare una sintassi.
 */
export function toParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

export type ResultSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }

/**
 * Il dominio dell'email richiede **almeno un punto**: senza, «scrivimi @luca»
 * o un `a@b` qualsiasi diventerebbero un `mailto:` rotto. È il caso che
 * separa un indirizzo da una chiocciola qualunque.
 */
const EMAIL = String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+`

/** Un indirizzo scritto nudo dentro la frase: finisce dove finisce la parola. */
const BARE = String.raw`https?:\/\/[^\s<]+|${EMAIL}`

/**
 * Destinazione di un link con parole proprie. Dentro le tonde l'URL non può
 * contenere la tonda che lo chiude, e le uniche forme ammesse sono le stesse
 * due dell'autolink: da un campo di testo non esce un `javascript:`.
 */
const TARGET = String.raw`https?:\/\/[^\s<)]+|(?:mailto:)?${EMAIL}`

/**
 * Link con parole proprie, nell'unica sintassi che chi scrive già incontra nel
 * [[Testo dell'email di conferma]]: `[informativa](https://…)`.
 *
 * Serve dove il link *non è* il testo. Il [[Consenso all'informativa]] (ADR
 * 0012) è la richiesta che l'ha portato: «come indicato nell'informativa»
 * vuole la parola cliccabile dentro la frase, e un URL nudo in coda alla riga
 * accanto alla casella è la stessa cosa solo per chi l'ha scritto.
 *
 * Non è markdown: è una sola coppia di parentesi, letta a mano. Il resto —
 * grassetti, titoli, elenchi — resta fuori, come dice l'intestazione di questo
 * modulo, e un `[qualcosa](non-un-indirizzo)` resta il testo che l'admin ha
 * scritto invece di sparire in un link rotto.
 */
const LABELLED = String.raw`\[([^\]\n]+)\]\((${TARGET})\)`

const LINK_PATTERN = new RegExp(`${LABELLED}|(${BARE})`, 'g')

/** Punteggiatura che chiude la frase e non fa parte dell'indirizzo. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/

/** Solo `http(s)` e `mailto:`: nessun altro schema entra da un campo di testo. */
function hrefOf(target: string): string {
  return target.startsWith('http') || target.startsWith('mailto:') ? target : `mailto:${target}`
}

/**
 * Spezza un paragrafo in testo e link. Serve perché i campi sono testo
 * semplice: «scrivici a info@…» dentro un iframe, su un telefono, senza link,
 * è un invito che costringe a trascrivere a mano un indirizzo.
 *
 * Due forme, con la stessa uscita: l'indirizzo scritto nudo, che diventa link
 * di sé stesso, e `[parole](indirizzo)`, che dà il link a parole già dentro la
 * frase.
 */
export function linkify(text: string): ResultSegment[] {
  const segments: ResultSegment[] = []
  let lastIndex = 0

  const pushTextUpTo = (end: number) => {
    if (end > lastIndex) segments.push({ kind: 'text', text: text.slice(lastIndex, end) })
  }

  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index
    if (start === undefined) continue
    const [whole, label, target, bare] = match

    if (label !== undefined && target !== undefined) {
      const shown = label.trim()
      // Parentesi vuote di parole: non c'è niente da rendere cliccabile, e
      // «continue» senza toccare `lastIndex` le lascia dove sono, testo.
      if (!shown) continue
      pushTextUpTo(start)
      segments.push({ kind: 'link', text: shown, href: hrefOf(target) })
      lastIndex = start + whole.length
      continue
    }

    // La punteggiatura si toglie solo all'indirizzo nudo: dentro le tonde
    // finisce dove l'ha finito chi scrive, punto finale compreso.
    const found = bare.replace(TRAILING_PUNCTUATION, '')
    if (!found) continue
    pushTextUpTo(start)
    segments.push({ kind: 'link', text: found, href: hrefOf(found) })
    lastIndex = start + found.length
  }

  pushTextUpTo(text.length)
  return segments
}
