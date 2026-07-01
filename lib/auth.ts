import { createHash } from 'crypto'
import { cookies, headers } from 'next/headers'

const COOKIE_NAME = 'session'

export type Role = 'admin' | 'staff'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@eventi.it'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'
const STAFF_EMAIL = process.env.STAFF_EMAIL ?? 'staff@eventi.it'
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? 'staff123'

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
