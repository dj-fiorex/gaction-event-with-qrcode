/**
 * Utility condivise per l'incorporamento del form di registrazione su siti terzi.
 * Usate sia dal backend Convex (validazione/persistenza) sia dal frontend
 * (editor origini in admin, costruzione dello snippet).
 */

/** Configurazione di embedding esposta per un Evento. */
export interface EmbedConfig {
  embedEnabled: boolean
  allowedOrigins: string[]
}

/**
 * Un'origine ammessa: origine esatta (`https://www.partner.com`) oppure
 * wildcard di sottodominio (`https://*.partner.com`). Lo schema è obbligatorio.
 */
const ORIGIN_PATTERN =
  /^https?:\/\/(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+(:\d{1,5})?$/i

/**
 * Normalizza e valida una singola origine.
 * @returns l'origine normalizzata (senza slash finale, host in minuscolo) o
 *          `null` se il formato non è valido.
 */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  if (!ORIGIN_PATTERN.test(trimmed)) return null

  const schemeEnd = trimmed.indexOf('://')
  const scheme = trimmed.slice(0, schemeEnd).toLowerCase()
  const rest = trimmed.slice(schemeEnd + 3).toLowerCase()
  return `${scheme}://${rest}`
}

export interface ParsedOrigins {
  valid: string[]
  invalid: string[]
}

/**
 * Interpreta un elenco di origini (una per riga o array), rimuove duplicati e
 * separa le voci valide da quelle non valide.
 */
export function parseAllowedOrigins(input: string | string[]): ParsedOrigins {
  const lines = Array.isArray(input) ? input : input.split(/\r?\n/)
  const valid: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const raw = line.trim()
    if (!raw) continue
    const normalized = normalizeOrigin(raw)
    if (!normalized) {
      invalid.push(raw)
      continue
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    valid.push(normalized)
  }

  return { valid, invalid }
}

/**
 * Costruisce il valore della direttiva CSP `frame-ancestors`.
 * Senza origini autorizzate l'incorporamento è vietato (`'none'`).
 */
export function frameAncestorsValue(config: EmbedConfig): string {
  if (!config.embedEnabled || config.allowedOrigins.length === 0) {
    return "'none'"
  }
  return config.allowedOrigins.join(' ')
}

/* ------------------------------------------------------------------ *
 * Aspetto dell'Incorporamento (ADR 0013)
 * ------------------------------------------------------------------ */

/**
 * Stack tipografici selezionabili. Sono un'enum e non una stringa CSS libera:
 * un font-family digitato a mano si scrive una volta sola e poi ripiega in
 * silenzio sul font di sistema per chiunque non lo abbia installato, il che in
 * un form incorporato somiglia a un bug e non a una scelta. Nessun webfont
 * caricato: il font del committente è quasi sempre su licenza (Monotype via
 * Wix nel caso che ha originato la feature) e non è nostro da servire.
 */
export const EMBED_FONT_STACKS = {
  system: {
    label: 'Predefinito',
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  helvetica: {
    label: 'Helvetica / Arial',
    stack: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  georgia: { label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  times: { label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  mono: {
    label: 'Monospazio',
    stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
} as const

export type EmbedFontStack = keyof typeof EMBED_FONT_STACKS

export const EMBED_FONT_STACK_KEYS = Object.keys(EMBED_FONT_STACKS) as EmbedFontStack[]

/** I sei valori che l'admin sceglie. Tutto il resto è derivato. */
export interface EmbedTheme {
  /** Colore del brand: bottoni e anello di focus. `#rrggbb`. */
  accent: string
  /** Colore del testo. `#rrggbb`. */
  foreground: string
  /** Colore di fondo, sempre opaco. `#rrggbb`. */
  background: string
  fontStack: EmbedFontStack
  /** Percentuale sulla dimensione radice: scala *tutto* il testo. */
  textScale: number
  /** Raggio degli angoli in px. */
  radius: number
}

/**
 * L'aspetto odierno espresso nei sei valori. Serve a due cose: prepopolare il
 * form dell'admin (così cambiare un solo colore resta una sola modifica, pur
 * salvando l'oggetto intero) e rendere l'Incorporamento quando l'Evento non ha
 * un Aspetto proprio. I colori sono la conversione in sRGB degli `oklch` di
 * `globals.css`, non valori inventati.
 */
export const DEFAULT_EMBED_THEME: EmbedTheme = {
  accent: '#1364ce',
  foreground: '#0a0a0a',
  background: '#ffffff',
  fontStack: 'system',
  textScale: 100,
  radius: 10,
}

export const EMBED_TEXT_SCALE_MIN = 80
export const EMBED_TEXT_SCALE_MAX = 140
export const EMBED_RADIUS_MAX = 24

/** Soglia WCAG AA per il testo normale. Avvisa, non blocca (ADR 0013). */
export const EMBED_CONTRAST_MIN = 4.5

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Normalizza un colore esadecimale in `#rrggbb` minuscolo. Accetta la forma a
 * tre cifre e il cancelletto omesso, perché è ciò che si incolla da un manuale
 * di brand. Qualunque altra sintassi CSS (`rgb()`, `hsl()`, nomi) è rifiutata:
 * i valori finiscono in `color-mix()` e in un calcolo di contrasto, entrambi i
 * quali hanno bisogno di componenti numeriche certe.
 */
export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim()
  const match = HEX_PATTERN.exec(trimmed)
  if (!match) return null
  const digits = match[1].toLowerCase()
  if (digits.length === 3) {
    return `#${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
  }
  return `#${digits}`
}

/** Luminanza relativa WCAG di un `#rrggbb` già normalizzato. */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rapporto di contrasto WCAG fra due colori `#rrggbb`. Da 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Bianco o nero, quello che si legge meglio sopra `hex`. È il colore del testo
 * dentro il bottone: una domanda che nessun committente dovrebbe doversi porre,
 * e che sbagliata produce l'unico esito davvero inaccettabile — un bottone
 * illeggibile — quindi non è un valore configurabile ma un calcolo.
 *
 * Il bianco vince ogni volta che basta, invece di prendere sempre il contrasto
 * più alto: sui colori di marca saturi il massimo puro sceglie il nero per
 * differenze irrisorie — sul magenta `#e5007c` fa 4,62 contro 4,54 — e il
 * bottone finirebbe col testo nero mentre il sito che ospita il form lo scrive
 * in bianco. Sotto la soglia AA la convenzione lascia il posto al calcolo.
 */
export function readableOn(hex: string): '#ffffff' | '#000000' {
  const onWhite = contrastRatio(hex, '#ffffff')
  if (onWhite >= EMBED_CONTRAST_MIN) return '#ffffff'
  return onWhite >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000'
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export interface ParsedEmbedTheme {
  theme: EmbedTheme
  invalid: string[]
}

/**
 * Valida e normalizza un Aspetto in arrivo dal client. I valori fuori scala
 * vengono riportati nell'intervallo (una scala del 900% non è un'opinione da
 * rispettare), mentre un colore malformato è un errore da segnalare: è un dato
 * che l'admin ha digitato e che non possiamo indovinare.
 */
export function parseEmbedTheme(input: {
  accent: string
  foreground: string
  background: string
  fontStack: string
  textScale: number
  radius: number
}): ParsedEmbedTheme {
  const invalid: string[] = []

  const colour = (raw: string, label: string, fallback: string): string => {
    const normalized = normalizeHexColor(raw)
    if (!normalized) {
      invalid.push(label)
      return fallback
    }
    return normalized
  }

  const fontStack = (EMBED_FONT_STACK_KEYS as string[]).includes(input.fontStack)
    ? (input.fontStack as EmbedFontStack)
    : DEFAULT_EMBED_THEME.fontStack

  return {
    theme: {
      accent: colour(input.accent, 'accento', DEFAULT_EMBED_THEME.accent),
      foreground: colour(input.foreground, 'testo', DEFAULT_EMBED_THEME.foreground),
      background: colour(input.background, 'sfondo', DEFAULT_EMBED_THEME.background),
      fontStack,
      textScale: clamp(input.textScale, EMBED_TEXT_SCALE_MIN, EMBED_TEXT_SCALE_MAX),
      radius: clamp(input.radius, 0, EMBED_RADIUS_MAX),
    },
    invalid,
  }
}

/**
 * Traduce i sei valori nei token del design system.
 *
 * I dieci token che l'admin *non* sceglie sono derivati con `color-mix()` in
 * oklab, cioè nello stesso spazio in cui `globals.css` scrive i suoi `oklch`:
 * le percentuali qui sotto riproducono le luminosità del tema odierno (bordo
 * L 0.897 contro 0.9, testo attenuato 0.487 contro 0.5, superfici 0.966 contro
 * 0.97). Il vantaggio non è la fedeltà al default ma il caso brandizzato: con
 * un testo blu il grigio attenuato e i bordi diventano *azzurrini*, coerenti
 * col brand, cosa che dieci campi colore separati non otterrebbero mai — li
 * lascerebbero grigi, e il form continuerebbe a sembrare di qualcun altro.
 *
 * `--destructive` non è qui: il rosso d'errore è semantico, non è brand, e un
 * committente col rosso in tavolozza non deve poter rendere indistinguibile un
 * messaggio di errore.
 */
export function embedThemeCssVars(theme: EmbedTheme): Record<string, string> {
  const { accent, foreground: fg, background: bg } = theme
  const mix = (percent: number) => `color-mix(in oklab, ${fg} ${percent}%, ${bg})`

  return {
    '--background': bg,
    '--card': bg,
    '--popover': bg,
    '--foreground': fg,
    '--card-foreground': fg,
    '--popover-foreground': fg,
    '--secondary-foreground': fg,
    '--accent-foreground': fg,
    '--muted-foreground': mix(60),
    '--border': mix(12),
    '--input': mix(12),
    '--muted': mix(4),
    '--secondary': mix(4),
    '--accent': mix(4),
    '--primary': accent,
    '--ring': accent,
    '--primary-foreground': readableOn(accent),
    '--radius': `${theme.radius}px`,
    '--font-sans': EMBED_FONT_STACKS[theme.fontStack].stack,
  }
}

/**
 * La famiglia da applicare come `font-family` esplicita sul contenitore.
 *
 * Non basta scrivere `--font-sans`: in Tailwind v4 il blocco `@theme inline` di
 * `globals.css` *incorpora* il valore dentro l'utility `font-sans`, che quindi
 * non rilegge la variabile. I colori e il raggio invece passano da `var()` e si
 * sovrascrivono per sottoalbero senza problemi.
 */
export function embedThemeFontFamily(theme: EmbedTheme): string {
  return EMBED_FONT_STACKS[theme.fontStack].stack
}
