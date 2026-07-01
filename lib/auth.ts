import { createHash } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'admin_session'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@eventi.it'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123'

/** Token di sessione deterministico legato alle credenziali correnti. */
function sessionToken(): string {
  return createHash('sha256')
    .update(`${ADMIN_EMAIL}:${ADMIN_PASSWORD}:evt-admin`)
    .digest('hex')
}

export function verifyCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD
}

export async function createSession(): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value === sessionToken()
}
