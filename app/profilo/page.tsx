'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthActions } from '@convex-dev/auth/react'
import { CalendarDays, LogOut, User } from 'lucide-react'
import Link from 'next/link'
import { useCurrentUser } from '@/lib/use-current-user'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

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

function ProfiloContent() {
  const { user } = useCurrentUser()
  const { signOut } = useAuthActions()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.replace('/')
  }

  if (!user) return null

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>Eventi Aziendali</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Esci
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Il mio profilo</h1>
          <p className="text-muted-foreground">Gestisci il tuo account.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" aria-hidden="true" />
              Dati account
            </CardTitle>
            <CardDescription>Le informazioni del tuo account Membro.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Nome</p>
              <p className="text-sm">{user.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-sm">{user.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ruolo</p>
              <p className="text-sm capitalize">{user.role}</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function ProfiloPage() {
  const { isLoading, isAuthenticated, role } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace('/admin/login')
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) return <FullPageLoader label="Caricamento profilo…" />
  if (!isAuthenticated) return <FullPageLoader label="Reindirizzamento…" />
  if (!role) return <FullPageLoader label="Caricamento profilo…" />

  return <ProfiloContent />
}
