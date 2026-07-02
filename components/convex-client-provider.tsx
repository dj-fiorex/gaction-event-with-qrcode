'use client'

import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'

// Trim trailing slashes: Convex derives the realtime WebSocket URL by string
// concatenation (`${origin}/api/${version}/sync`), so a trailing slash in the
// env var produces a double slash (`//api/.../sync`) that the server rejects
// with WebSocket code 1006, leaving every query stuck loading.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\/+$/, '')

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground">
          <h1 className="text-lg font-semibold">Convex non configurato</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            La variabile d&apos;ambiente <code className="font-mono">NEXT_PUBLIC_CONVEX_URL</code> non
            è impostata. Collega un deployment Convex al progetto per abilitare il backend realtime.
          </p>
        </div>
      </div>
    )
  }

  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
}
