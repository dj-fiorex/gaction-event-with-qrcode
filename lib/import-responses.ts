/**
 * File di risposte (ADR 0020): il foglio esportato dal modulo esterno con cui
 * il committente ha raccolto le risposte a un Evento prima del form pubblico.
 *
 * Qui vive solo la **lettura**: dalle righe del foglio alle risposte
 * normalizzate che la mutation di import sa scrivere. Le regole dell'Evento
 * (tetti, età, una risposta per email) non stanno qui — le applica il server,
 * riga per riga, e questo modulo non deve saperle. È puro apposta: gira nel
 * browser, dove il file viene letto, e nei test, dove il file non c'è.
 *
 * Il tracciato è **fisso**, riconosciuto dalle intestazioni e non dalla
 * posizione: le colonne possono stare in qualsiasi ordine, quelle sconosciute
 * si ignorano, un'intestazione attesa che manca ferma tutto prima di leggere
 * una riga. La data di risposta del modulo esterno non si importa.
 */

/** Una riga letta e capita: ciò che la mutation di import riceve. */
export interface ImportedResponse {
  /** Numero di riga nel foglio (1 = intestazione), per il rapporto. */
  row: number
  firstName: string
  lastName: string
  email: string
  /** «Vuoi partecipare?»: true = Prenotazione, false = Rinuncia. */
  participates: boolean
  /** Un Figlio per ogni età valorizzata; la colonna «Quanti figli» non conta. */
  childrenAges: number[]
  companionsCount: number
  /** La nota così com'è, anche se somiglia a un'allergia: non si reinterpreta. */
  notes: string | null
}

/** Una riga che non si è capita, e perché. Non ferma le altre. */
export interface UnreadableRow {
  row: number
  /** Nome e cognome se leggibili, per ritrovare la riga a occhio. */
  name: string
  reason: string
}

export interface ParsedResponses {
  responses: ImportedResponse[]
  unreadable: UnreadableRow[]
}

/**
 * Le colonne che il tracciato conosce. Il confronto è sull'intestazione
 * normalizzata (minuscolo, spazi compressi) e per **prefisso** dove il testo
 * della domanda è lungo e riscrivibile dal committente: «Email aziendale (se
 * disponibile)» deve continuare a valere se un giorno diventa «Email».
 */
const COLUMN = {
  firstName: { match: (h: string) => h === 'nome', label: 'Nome' },
  lastName: { match: (h: string) => h === 'cognome', label: 'Cognome' },
  email: { match: (h: string) => h.startsWith('email'), label: 'Email' },
  participates: {
    match: (h: string) => h.startsWith('vuoi partecipare'),
    label: 'Vuoi partecipare all’evento?',
  },
  companionYesNo: {
    match: (h: string) => h.startsWith('verrai con un familiare adulto'),
    label: 'Verrai con un familiare adulto?',
  },
  companionCount: {
    match: (h: string) => h.startsWith('quanti familiari adulti'),
    label: 'Quanti familiari adulti verranno con te?',
  },
  notes: { match: (h: string) => h.startsWith('hai note'), label: 'Hai note…' },
} as const

const CHILD_AGE_PATTERN = /^età del figlio (\d+)$/

/** Senza queste quattro non c'è risposta da leggere. Le altre sono facoltative. */
const REQUIRED_COLUMNS = ['firstName', 'lastName', 'email', 'participates'] as const

export class MissingColumnsError extends Error {
  constructor(public readonly columns: string[]) {
    super(`Colonne mancanti nel file: ${columns.join(', ')}`)
    this.name = 'MissingColumnsError'
  }
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/** Sì/No del modulo esterno: «Si», «Sì», «SI», «no». Altro = non capito. */
function parseYesNo(value: string): boolean | null {
  const v = value.toLowerCase()
  if (v === 'si' || v === 'sì') return true
  if (v === 'no') return false
  return null
}

/**
 * Quanti familiari adulti, da una delle due colonne del modulo — «Sì, con 1
 * familiare adulto» e «2 familiari adulti» portano il numero nel testo,
 * «Nessuno» e «No» valgono zero. Un «Sì» senza numero vale uno: è la risposta
 * alla domanda «verrai con *un* familiare adulto?».
 */
function parseCompanions(value: string): number | null {
  if (value === '') return 0
  const v = value.toLowerCase()
  if (v === 'nessuno' || v === 'no') return 0
  const digits = v.match(/\d+/)
  if (digits) return Number(digits[0])
  if (v.startsWith('si') || v.startsWith('sì')) return 1
  return null
}

function parseAge(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  return Number(value)
}

/**
 * Legge le righe del foglio — oggetti intestazione → cella, come li produce
 * `sheet_to_json` — e restituisce le risposte capite e quelle no.
 *
 * Solleva `MissingColumnsError` se manca una delle quattro colonne senza cui
 * non c'è risposta da leggere: quello non è un difetto di una riga, è il file
 * sbagliato, e va detto prima di scrivere qualunque cosa.
 */
export function parseResponses(rows: ReadonlyArray<Record<string, unknown>>): ParsedResponses {
  // Un foglio senza righe non ha intestazioni da riconoscere: è vuoto, non
  // sbagliato.
  if (rows.length === 0) return { responses: [], unreadable: [] }

  const headers = new Set<string>()
  for (const r of rows) for (const key of Object.keys(r)) headers.add(key)

  const columnFor = (match: (h: string) => boolean): string | null =>
    [...headers].find((h) => match(normalizeHeader(h))) ?? null

  const resolved = {
    firstName: columnFor(COLUMN.firstName.match),
    lastName: columnFor(COLUMN.lastName.match),
    email: columnFor(COLUMN.email.match),
    participates: columnFor(COLUMN.participates.match),
    companionYesNo: columnFor(COLUMN.companionYesNo.match),
    companionCount: columnFor(COLUMN.companionCount.match),
    notes: columnFor(COLUMN.notes.match),
  }

  const missing = REQUIRED_COLUMNS.filter((key) => resolved[key] === null).map(
    (key) => COLUMN[key].label,
  )
  if (missing.length > 0) throw new MissingColumnsError(missing)

  // «Età del figlio N», in ordine di N e non di colonna: il foglio potrebbe
  // averle spostate, e Figlio 1 deve restare il primo.
  const ageColumns = [...headers]
    .map((h) => ({ header: h, n: Number(normalizeHeader(h).match(CHILD_AGE_PATTERN)?.[1]) }))
    .filter((c) => Number.isFinite(c.n))
    .sort((a, b) => a.n - b.n)
    .map((c) => c.header)

  const responses: ImportedResponse[] = []
  const unreadable: UnreadableRow[] = []

  rows.forEach((r, index) => {
    // Riga 1 è l'intestazione: la prima riga di dati è la 2, come in Excel.
    const rowNumber = index + 2
    const firstName = cellText(r[resolved.firstName!])
    const lastName = cellText(r[resolved.lastName!])
    const name = `${firstName} ${lastName}`.trim()
    const fail = (reason: string) => unreadable.push({ row: rowNumber, name, reason })

    if (firstName === '' || lastName === '') return fail('Nome o cognome mancante')

    const email = cellText(r[resolved.email!])
    if (email === '') return fail('Email mancante')

    const participates = parseYesNo(cellText(r[resolved.participates!]))
    if (participates === null) return fail('Risposta a «Vuoi partecipare?» non riconosciuta')

    const notesText = resolved.notes ? cellText(r[resolved.notes]) : ''
    const notes = notesText === '' ? null : notesText

    // Un «no» è solo nome, email e nota: età e familiari, se pure ci fossero,
    // non farebbero una Rinuncia diversa, e un refuso lì non deve perderla.
    if (!participates) {
      responses.push({
        row: rowNumber,
        firstName,
        lastName,
        email,
        participates,
        childrenAges: [],
        companionsCount: 0,
        notes,
      })
      return
    }

    const childrenAges: number[] = []
    for (const column of ageColumns) {
      const text = cellText(r[column])
      if (text === '') continue
      const age = parseAge(text)
      if (age === null) return fail(`Età non riconosciuta in «${column}»: ${text}`)
      childrenAges.push(age)
    }

    // Nel modulo è valorizzata una sola delle due colonne: si legge quella
    // piena. Se lo sono entrambe vince il conteggio, che è la domanda più
    // precisa.
    const countText = resolved.companionCount ? cellText(r[resolved.companionCount]) : ''
    const yesNoText = resolved.companionYesNo ? cellText(r[resolved.companionYesNo]) : ''
    const companionsCount = parseCompanions(countText !== '' ? countText : yesNoText)
    if (companionsCount === null) {
      return fail('Numero di familiari adulti non riconosciuto')
    }

    responses.push({
      row: rowNumber,
      firstName,
      lastName,
      email,
      participates,
      childrenAges,
      companionsCount,
      notes,
    })
  })

  return { responses, unreadable }
}

/**
 * Le righe del primo foglio di un file Excel, come le vuole `parseResponses`.
 * Vive qui e non nel componente perché è l'unico punto in cui il tracciato
 * incontra il formato del file: il foglio delle risposte è sempre il primo,
 * il «Riepilogo» che il committente aggiunge accanto non si legge. Chi
 * accetta i termini del modulo esterno non lo fa alle nostre parole: la
 * colonna «Terms and Conditions» non si legge, il consenso lo annota il server.
 */
export async function readResponsesFile(file: Blob): Promise<Record<string, unknown>[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const first = workbook.SheetNames[0]
  if (!first) return []
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[first], {
    defval: null,
  })
}
