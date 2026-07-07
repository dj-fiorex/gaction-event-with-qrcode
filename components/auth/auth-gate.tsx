'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useCurrentUser, type Role } from '@/lib/use-current-user'

function FullPageLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
      </span>
    </div>
  )
}

interface AuthGateProps {
  /**
   * Ruolo minimo richiesto.
   * - 'staff' consente sia staff sia admin (ma non member)
   * - 'admin' solo admin
   * I Membri che tentano di accedere a queste aree vengono reindirizzati
   * a '/profilo'.
   */
  require: Role
  children: (user: { role: Role }) => React.ReactNode
}

/**
 * Gate lato client per le aree riservate. La sicurezza reale è comunque
 * garantita server-side da ogni function Convex (`requireAdmin`/`requireUser`):
 * questo gate gestisce solo redirect e stati di caricamento nella UI.
 */
export function AuthGate({ require, children }: AuthGateProps) {
  const router = useRouter()
  const { role, isLoading, isAuthenticated } = useCurrentUser()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      const current = window.location.pathname
      router.replace(`/admin/login?redirect=${encodeURIComponent(current)}`)
      return
    }
    // Members cannot access admin or staff areas.
    if (role === 'member') {
      router.replace('/profilo')
      return
    }
    if (require === 'admin' && role !== 'admin') {
      router.replace('/staff')
    }
  }, [isLoading, isAuthenticated, role, require, router])

  if (isLoading) return <FullPageLoader label="Verifica accesso…" />
  if (!isAuthenticated) return <FullPageLoader label="Reindirizzamento…" />
  if (role === 'member') return <FullPageLoader label="Reindirizzamento…" />
  if (require === 'admin' && role !== 'admin') return <FullPageLoader label="Reindirizzamento…" />
  if (!role) return <FullPageLoader label="Caricamento profilo…" />

  return <>{children({ role })}</>
}
