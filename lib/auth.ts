import { createHash } from 'crypto'
import { cookies, headers } from 'next/headers'

const COOKIE_NAME = 'session'

export type Role = 'admin' | 'staff'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@eventi.it'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? 'staff@eventi.it'
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? 'staff123'

/** Segreto per firmare cookie di scansione e hash delle password di check-in. */
const SCAN_SECRET = process.env.SCAN_SECRET ?? `${ADMIN_EMAIL}:${ADMIN_PASSWORD}:evt-scan`

/** Prefisso del cookie di sessione di scansione, uno per token di Evento. */
const SCAN_COOKIE_PREFIX = 'scan_'

/** Durata (secondi) del cookie persistente quando l'utente sceglie "ricordami". */
const SCAN_REMEMBER_MAX_AGE = 60 * 60 * 12

/** Token di sessione deterministico legato al ruolo e alle sue credenziali. */
function sessionToken(role: Role): string {
  const secret =
    role === 'admin' ? `${ADMIN_EMAIL}:${ADMIN_PASSWORD}` : `${STAFF_EMAIL}:${STAFF_PASSWORD}`
  return createHash('sha256').update(`${role}:${secret}:evt-session`).digest('hex')
}

/** Restituisce il ruolo se le credenziali sono valide, altrimenti null. */
export function verifyCredentials(email: string, password: string): Role | null {
  const normalized = email.trim().toLowerCase()
  if (normalized === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
    return 'admin'
  }
  if (normalized === STAFF_EMAIL.toLowerCase() && password === STAFF_PASSWORD) {
    return 'staff'
  }
  return null
}

/**
 * Determina se la richiesta corrente arriva via HTTPS.
 * La preview di v0 e la produzione sono servite su HTTPS tramite proxy,
 * quindi controlliamo l'header x-forwarded-proto oltre a NODE_ENV.
 */
async function isSecureRequest(): Promise<boolean> {
  if (process.env.NODE_ENV === 'production') return true
  const headerStore = await headers()
  const proto = headerStore.get('x-forwarded-proto')
  return proto?.split(',')[0].trim() === 'https'
}

export async function createSession(role: Role): Promise<void> {
  const store = await cookies()
  const secure = await isSecureRequest()
  store.set(COOKIE_NAME, `${role}.${sessionToken(role)}`, {
    httpOnly: true,
    // SameSite=None richiede Secure ed è necessario perché l'app gira
    // dentro un iframe cross-site (preview di v0). In dev su HTTP puro
    // ricadiamo su Lax dato che None senza Secure verrebbe rifiutato.
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 8,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

/** Ruolo corrente derivato dal cookie di sessione, o null se non valido. */
export async function getRole(): Promise<Role | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return null
  const [role, token] = raw.split('.') as [Role, string]
  if ((role === 'admin' || role === 'staff') && token === sessionToken(role)) {
    return role
  }
  return null
}

/** True per qualsiasi sessione valida (admin o staff). */
export async function isAuthenticated(): Promise<boolean> {
  return (await getRole()) !== null
}

/** True solo per una sessione admin. */
export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === 'admin'
}

/* ------------------------------------------------------------------ */
/* Accesso al check-in tramite password (eventi "password-protected")  */
/* ------------------------------------------------------------------ */

/** Calcola l'hash deterministico di una password di check-in. */
export function hashCheckInPassword(password: string): string {
  return createHash('sha256').update(`checkin:${password}:${SCAN_SECRET}`).digest('hex')
}

/** Verifica una password di check-in contro l'hash memorizzato. */
export function verifyCheckInPassword(password: string, hash: string | null): boolean {
  if (!hash) return false
  return hashCheckInPassword(password) === hash
}

/** Firma associata a un token di scansione, usata come valore del cookie. */
function scanSignature(token: string): string {
  return createHash('sha256').update(`scan-session:${token}:${SCAN_SECRET}`).digest('hex')
}

/**
 * Crea la sessione di scansione per un Evento password-protected.
 * Se `remember` è true il cookie è persistente (12h), altrimenti è un cookie
 * di sessione che scade alla chiusura del browser.
 */
export async function createScanSession(token: string, remember: boolean): Promise<void> {
  const store = await cookies()
  const secure = await isSecureRequest()
  store.set(`${SCAN_COOKIE_PREFIX}${token}`, scanSignature(token), {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/',
    ...(remember ? { maxAge: SCAN_REMEMBER_MAX_AGE } : {}),
  })
}

/** True se esiste una sessione di scansione valida per il token indicato. */
export async function hasScanSession(token: string): Promise<boolean> {
  const store = await cookies()
  const raw = store.get(`${SCAN_COOKIE_PREFIX}${token}`)?.value
  return Boolean(raw) && raw === scanSignature(token)
}
