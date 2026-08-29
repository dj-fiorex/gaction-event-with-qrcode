import { CATEGORY_LABEL } from './person-labels'
import type { PersonCategory } from './types'

/**
 * Composizione del documento markdown dell'email di conferma (issue #42).
 *
 * L'email è: il **Testo dell'email di conferma** dell'Evento — markdown scritto
 * dall'admin — seguito dal **Riepilogo della Prenotazione** generato. I due
 * pezzi vengono concatenati *come markdown* e resi con una sola `render()`:
 * niente splicing di HTML, così l'anteprima nel form admin mostra il corpo
 * passato per lo stesso motore che rende l'email in partenza.
 *
 * I QR code non compaiono più nel corpo: viaggiano solo nel PDF allegato
 * (ADR 0007).
 */

/** Persona come serve al Riepilogo: i campi mostrati, niente QR. */
export interface EmailSummaryPerson {
  name: string
  category: PersonCategory
  age: number | null
  /** Allergie e intolleranze dichiarate. null = nessuna dichiarazione. */
  allergies: string | null
  ticketCode: string
}

/**
 * Testo dell'email di conferma: una stringa vuota o di soli spazi vale «non
 * impostato». Unico punto di verità, condiviso da chi scrive il campo
 * sull'Evento e da chi lo rilegge per comporre l'email.
 */
export function normalizeEmailCopy(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined
}

/**
 * Rende il testo scritto dall'Utente (nomi, allergie) sicuro da innestare in
 * una riga del documento markdown. Fa due cose, ed entrambe servono: riduce il
 * testo a una riga sola — un a capo dentro un elenco lo spezzerebbe — e
 * neutralizza la punteggiatura che il markdown interpreta, così un nome con un
 * `*` o un `<script>` si legge come tale invece di diventare formattazione o
 * HTML. I backslash spariscono nel rendering: il testo mostrato resta identico
 * a quello dichiarato.
 *
 * Il corpo dell'Evento non passa di qui: è markdown a tutti gli effetti, scritto
 * dall'admin e non dal pubblico.
 */
function escapeInlineUserText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>&~|]/g, (char) => `\\${char}`)
}

/**
 * Il `ticketCode` va in uno span di codice, dove i backslash sarebbero
 * letterali: l'unico carattere da cui difendersi è il backtick, che chiuderebbe
 * lo span. I codici sono generati e non ne contengono — questa è la garanzia,
 * non l'assunzione.
 */
function inlineCode(value: string): string {
  return `\`${value.replace(/[`\s]/g, '')}\``
}

/** Riga di intestazione di una Persona nel Riepilogo. */
function personHeading(person: EmailSummaryPerson, collectNames: boolean): string {
  const ageLabel = person.category === 'child' && person.age != null ? ` · ${person.age} anni` : ''
  // Con «Raccolta nomi» disattiva (issue #36) il nome di Figli/Ospiti È già
  // l'Etichetta posizionale («Figlio 1», «Ospite 1»): si mostra da sola (con
  // l'età per i Figli), senza ripetere la categoria. L'Iscritto conserva sempre
  // il proprio nome, quindi la categoria «Iscritto» resta indicata.
  const isPositionalLabel = !collectNames && person.category !== 'user'
  const name = escapeInlineUserText(person.name)
  return isPositionalLabel
    ? `**${name}**${ageLabel}`
    : `**${name}** — ${CATEGORY_LABEL[person.category]}${ageLabel}`
}

/**
 * Riepilogo della Prenotazione: un elenco con, per ogni Persona, etichetta o
 * nome, età dove si applica, `ticketCode` e Allergie e intolleranze.
 *
 * È l'unica superficie che l'Utente riceve dove le allergie sono visibili: il
 * PDF dei biglietti non le riporta, per non portare un dato sanitario sul
 * foglio mostrato al varco.
 */
function buildBookingSummary(persons: EmailSummaryPerson[], collectNames: boolean): string {
  const items = persons.map((person) => {
    const lines = [`- ${personHeading(person, collectNames)}`]
    lines.push(`  - Biglietto: ${inlineCode(person.ticketCode)}`)
    if (person.allergies) {
      lines.push(`  - Allergie e intolleranze: ${escapeInlineUserText(person.allergies)}`)
    }
    return lines.join('\n')
  })
  return ['## Riepilogo della prenotazione', '', items.join('\n')].join('\n')
}

/**
 * Corpo di ripiego: la formulazione odierna, resa in markdown. Vale quando
 * l'Evento non ha un Testo dell'email di conferma, così gli Eventi esistenti
 * continuano a mandare la stessa email senza alcun backfill.
 *
 * Unico scostamento dalla copy odierna: la frase sui QR dice **dove** trovarli.
 * Prima erano incorporati nel corpo, quindi bastava dire che c'erano; ora sono
 * nel PDF allegato, e quando l'allegato manca — la generazione è best-effort —
 * promettere un QR che nell'email non c'è sarebbe semplicemente falso.
 */
function defaultEmailBody(event: { title: string; location: string; hasPdf: boolean }): string {
  return [
    '# I vostri QR sono pronti',
    '',
    `## ${escapeInlineUserText(event.title)}`,
    '',
    `**Dove:** ${escapeInlineUserText(event.location)}`,
    '',
    event.hasPdf
      ? 'Ogni persona ha un proprio QR code, nel **PDF dei biglietti** in allegato: una pagina per persona, pronta da stampare. Presentatelo all’ingresso e a ogni attività prenotata.'
      : 'Ogni persona ha un proprio biglietto. Presentate il codice qui sotto all’ingresso e a ogni attività prenotata.',
  ].join('\n')
}

/** Oggetto dell'email. Vuoto sull'Evento = ripiego sulla formulazione odierna. */
export function ticketsEmailSubject(emailSubject: string | undefined, title: string): string {
  return normalizeEmailCopy(emailSubject)?.trim() ?? `Ticket per ${title}`
}

/**
 * Documento completo da passare a `render()`: corpo dell'Evento (o ripiego),
 * separatore, Riepilogo.
 *
 * Il corpo viene sempre per primo, e non è mai vuoto: un documento che
 * cominciasse con `---` verrebbe letto come frontmatter invece che come riga
 * orizzontale.
 */
export function buildTicketsEmailMarkdown(args: {
  emailBody: string | undefined
  event: { title: string; location: string }
  persons: EmailSummaryPerson[]
  collectNames: boolean
  hasPdf: boolean
}): string {
  const body =
    normalizeEmailCopy(args.emailBody)?.trim() ??
    defaultEmailBody({
      title: args.event.title,
      location: args.event.location,
      hasPdf: args.hasPdf,
    })
  return `${body}\n\n---\n\n${buildBookingSummary(args.persons, args.collectNames)}\n`
}
