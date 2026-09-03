import { CATEGORY_LABEL } from './person-labels'
import { fullName } from './person-name'
import type { PersonCategory, RegistrationSource } from './types'

/**
 * Composizione del documento markdown dell'email di conferma (issue #42).
 *
 * L'email è: il **Testo dell'email di conferma** dell'Evento — markdown scritto
 * dall'admin, con i **Segnaposto** del nome sostituiti — seguito dal
 * **Riepilogo della Prenotazione** generato, se l'Evento lo vuole. I due pezzi
 * vengono concatenati *come markdown* e resi con una sola `render()`: niente
 * splicing di HTML, così l'anteprima nel form admin mostra il corpo passato
 * per lo stesso motore che rende l'email in partenza.
 *
 * I QR code non compaiono più nel corpo: viaggiano solo nel PDF allegato
 * (ADR 0007).
 */

/** Persona come serve al Riepilogo: i campi mostrati, niente QR. */
export interface EmailSummaryPerson {
  firstName: string
  /** Cognome. null per Figli, Ospiti ed Etichette posizionali (ADR 0017). */
  lastName: string | null
  /**
   * Il nome è dichiarato o generato dal server? Arriva **sulla riga** e non si
   * ricava da `collectNames`: l'impostazione dell'Evento è patchabile, e
   * rileggerla qui reinterpreterebbe Prenotazioni già chiuse (ADR 0017).
   */
  nameProvided: boolean
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

/** I quattro campi di copy dell'Evento, come stanno sulla riga. */
export interface EventEmailCopy {
  emailSubject?: string
  emailBody?: string
  emailSubjectImport?: string
  emailBodyImport?: string
}

/**
 * Sceglie oggetto e corpo in base all'Origine della Prenotazione (ADR 0024).
 *
 * Il rapporto fra le due coppie è **asimmetrico di proposito**: quella del
 * form è *il* testo dell'Evento, quella dell'import è l'*eccezione*. Un campo
 * import vuoto ripiega quindi sul campo corrispondente del form, che a sua
 * volta ripiegherà sul testo generato dal codice — ma quel secondo passo non
 * è qui: lo fanno `ticketsEmailSubject` e `buildTicketsEmailMarkdown`, che già
 * lo facevano. Questa funzione restituisce il testo *scritto dall'admin* che
 * vince, o `undefined` se non ne è stato scritto nessuno.
 *
 * Il ripiego è **campo per campo**, come nei tre dell'Esito della Prenotazione:
 * scrivere il solo oggetto per gli importati resta una sola modifica, e non
 * costringe a ricopiare il corpo.
 *
 * È pura e sta qui, non nella query Convex, perché i quattro casi che contano
 * (import scritto, import vuoto, entrambi vuoti, solo l'oggetto scritto) sono
 * quattro asserzioni e non quattro invii.
 */
export function resolveEmailCopy(
  source: RegistrationSource,
  copy: EventEmailCopy,
): { subject: string | undefined; body: string | undefined } {
  const subject = normalizeEmailCopy(copy.emailSubject)
  const body = normalizeEmailCopy(copy.emailBody)
  if (source === 'form') return { subject, body }
  return {
    subject: normalizeEmailCopy(copy.emailSubjectImport) ?? subject,
    body: normalizeEmailCopy(copy.emailBodyImport) ?? body,
  }
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
function personHeading(person: EmailSummaryPerson): string {
  const ageLabel = person.category === 'child' && person.age != null ? ` · ${person.age} anni` : ''
  // Quando il nome è l'Etichetta posizionale («Figlio 1», «Ospite 1») si mostra
  // da sola, con l'età per i Figli: ripetere la categoria direbbe due volte la
  // stessa cosa. Lo dice la riga stessa (ADR 0017) e non più l'impostazione
  // dell'Evento, che nel frattempo può essere cambiata — spegnere la Raccolta
  // nomi dopo una Prenotazione stampava «Luca Rossi» come se fosse un'etichetta.
  const name = escapeInlineUserText(fullName(person))
  return person.nameProvided
    ? `**${name}** — ${CATEGORY_LABEL[person.category]}${ageLabel}`
    : `**${name}**${ageLabel}`
}

/**
 * Riepilogo della Prenotazione: un elenco con, per ogni Persona, etichetta o
 * nome, età dove si applica, `ticketCode` e Allergie e intolleranze.
 *
 * È l'unica superficie che l'Utente riceve dove le allergie sono visibili: il
 * PDF dei biglietti non le riporta, per non portare un dato sanitario sul
 * foglio mostrato al varco.
 */
function buildBookingSummary(persons: EmailSummaryPerson[]): string {
  const items = persons.map((person) => {
    const lines = [`- ${personHeading(person)}`]
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

/**
 * Segnaposto: le due parole che l'admin può scrivere nel Testo e che qui
 * diventano il nome e il cognome dell'Utente. L'insieme è chiuso e minimo —
 * ogni Segnaposto in più è una promessa da mantenere per sempre — e le
 * maiuscole e gli spazi dentro le graffe non contano, perché l'anteprima nel
 * form li mostra com'è scritti e non saprebbe dire a chi li scrive che
 * `{{ Nome }}` è sbagliato. Tutto il resto fra doppie graffe passa intatto:
 * è il contratto di `emailmd`, e chi lo legge nell'email lo vede.
 */
const PLACEHOLDER = /\{\{\s*(nome|cognome)\s*\}\}/gi

/** L'Utente come serve ai Segnaposto: i due campi del nome. */
export interface PlaceholderPerson {
  firstName: string
  lastName: string | null
}

/**
 * Sostituisce i Segnaposto nel Testo dell'Evento. I valori entrano
 * **neutralizzati** come il testo dell'Utente nel Riepilogo: un nome con un
 * asterisco resta un nome con un asterisco, e un `<b>` resta un `<b>` — il
 * Testo è markdown pieno, e un nome che potesse chiudere un tag lo sarebbe
 * anche lui. Senza Utente — non dovrebbe accadere, una Prenotazione ne ha
 * sempre uno — i Segnaposto spariscono invece di restare in chiaro a un
 * lettore vero.
 */
export function applyPlaceholders(body: string, utente: PlaceholderPerson | undefined): string {
  const values = {
    nome: escapeInlineUserText(utente?.firstName ?? ''),
    cognome: escapeInlineUserText(utente?.lastName ?? ''),
  }
  return body.replace(PLACEHOLDER, (_match, key: string) => {
    return values[key.toLowerCase() as keyof typeof values]
  })
}

/** Oggetto dell'email. Vuoto sull'Evento = ripiego sulla formulazione odierna. */
export function ticketsEmailSubject(emailSubject: string | undefined, title: string): string {
  return normalizeEmailCopy(emailSubject)?.trim() ?? `Ticket per ${title}`
}

/**
 * Documento completo da passare a `render()`: corpo dell'Evento (o ripiego),
 * poi — se l'Evento vuole il Riepilogo — separatore e Riepilogo.
 *
 * Il corpo viene sempre per primo, e non è mai vuoto: un documento che
 * cominciasse con `---` verrebbe letto come frontmatter invece che come riga
 * orizzontale.
 *
 * I Segnaposto si sostituiscono solo nel Testo scritto dall'admin: il corpo di
 * ripiego è nostro e non ne contiene. L'Utente si cerca fra le Persone della
 * Prenotazione, che arrivano comunque — anche a Riepilogo spento servono per
 * il nome.
 */
export function buildTicketsEmailMarkdown(args: {
  emailBody: string | undefined
  event: { title: string; location: string }
  persons: EmailSummaryPerson[]
  hasPdf: boolean
  /** Riepilogo in coda? Sull'Evento assente vale true: si vede. */
  showSummary: boolean
}): string {
  const authored = normalizeEmailCopy(args.emailBody)?.trim()
  const utente = args.persons.find((person) => person.category === 'user')
  const body =
    authored !== undefined
      ? applyPlaceholders(authored, utente)
      : defaultEmailBody({
          title: args.event.title,
          location: args.event.location,
          hasPdf: args.hasPdf,
        })
  if (!args.showSummary) return `${body}\n`
  return `${body}\n\n---\n\n${buildBookingSummary(args.persons)}\n`
}
