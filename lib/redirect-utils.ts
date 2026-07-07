const REDIRECT_BASE_URL = 'https://event-with-qrcode.local'

export function resolveInternalRedirect(raw: string | null) {
  if (!raw || raw.includes('\\')) return null

  try {
    const url = new URL(raw, REDIRECT_BASE_URL)
    if (url.origin !== REDIRECT_BASE_URL) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
