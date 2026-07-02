import { NextResponse, type NextRequest } from 'next/server'
import { frameAncestorsValue, type EmbedConfig } from '@/lib/embed'

/**
 * Deriva l'URL HTTP Actions di Convex (`*.convex.site`) da NEXT_PUBLIC_CONVEX_URL
 * (`*.convex.cloud`). Rimuove eventuali slash finali (gotcha noto sulle WS).
 */
function convexSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\/+$/, '')
  if (!raw) return null
  return raw.replace(/\.convex\.cloud$/, '.convex.site')
}

async function loadEmbedConfig(eventId: string): Promise<EmbedConfig> {
  const site = convexSiteUrl()
  if (!site) return { embedEnabled: false, allowedOrigins: [] }
  const res = await fetch(`${site}/embedConfig?eventId=${encodeURIComponent(eventId)}`, {
    // Evita cache stantìa lato edge; l'endpoint imposta un breve max-age.
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`embedConfig HTTP ${res.status}`)
  return (await res.json()) as EmbedConfig
}

/**
 * Imposta la CSP `frame-ancestors` per le pagine di incorporamento in base
 * all'allowlist dell'Evento. In assenza di configurazione o in caso di errore
 * si applica una policy chiusa (`'none'`): l'iframe non viene reso su alcun sito.
 */
export async function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  // /embed/eventi/<id>
  const eventId = segments[2] ?? ''

  let frameAncestors = "'none'"
  if (eventId) {
    try {
      frameAncestors = frameAncestorsValue(await loadEmbedConfig(eventId))
    } catch (error) {
      console.error('[v0] proxy embedConfig fetch failed:', error)
    }
  }

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', `frame-ancestors ${frameAncestors};`)
  return response
}

export const config = {
  matcher: '/embed/eventi/:path*',
}
