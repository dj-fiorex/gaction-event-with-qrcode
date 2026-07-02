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
