'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthActions } from '@convex-dev/auth/react'
import { useAction, useMutation } from 'convex/react'
import { BadgeCheck, CalendarDays, Loader2, LogOut, MailWarning, Pencil, User, X } from 'lucide-react'
import Link from 'next/link'
import { api } from '@/convex/_generated/api'
import { useCurrentUser } from '@/lib/use-current-user'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const updateName = useMutation(api.accounts.updateName)
  const resendVerification = useAction(api.emailVerification.resend)

  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendPending, setResendPending] = useState(false)
  const [resendFeedback, setResendFeedback] = useState<string | null>(null)

  async function handleSignOut() {
    await signOut()
    router.replace('/')
  }

  function startEditing() {
    setNameInput(user?.name ?? '')
    setError(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError(null)
  }

  async function handleResendVerification() {
    setResendFeedback(null)
    setResendPending(true)
    try {
      await resendVerification({})
      setResendFeedback('Abbiamo inviato un nuovo link di verifica alla tua email.')
    } catch (err) {
      setResendFeedback(err instanceof Error ? err.message : 'Invio non riuscito.')
    } finally {
      setResendPending(false)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await updateName({ name: nameInput })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aggiornamento non riuscito.')
    } finally {
      setPending(false)
    }
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

        {!user.emailVerified && user.role === 'member' && (
          <Card className="mb-6 border-amber-300/70 bg-amber-50/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-950">
                <MailWarning className="h-5 w-5" aria-hidden="true" />
                Email da verificare
              </CardTitle>
              <CardDescription className="text-amber-900/80">
                Prima di prenotare gli eventi che richiedono un account devi confermare il link
                ricevuto via email.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {user.email ? (
                <p className="text-sm text-amber-950">
                  Controlla la casella di <strong>{user.email}</strong> e, se non trovi il
                  messaggio, richiedi un nuovo invio.
                </p>
              ) : (
                <p className="text-sm text-amber-950">
                  Controlla la tua casella email e, se non trovi il messaggio, richiedi un nuovo
                  invio.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={handleResendVerification} disabled={resendPending}>
                  {resendPending ? 'Invio in corso…' : 'Reinvia email di verifica'}
                </Button>
                {resendFeedback && <p className="text-sm text-amber-950">{resendFeedback}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" aria-hidden="true" />
              Dati account
            </CardTitle>
            <CardDescription>Le informazioni del tuo account Membro.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Nome</p>
                {!editing && (
                  <Button variant="ghost" size="sm" onClick={startEditing} aria-label="Modifica il nome del profilo">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Modifica
                  </Button>
                )}
              </div>
              {editing ? (
                <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-2">
                  <Label htmlFor="name-input" className="sr-only">
                    Nome
                  </Label>
                  <Input
                    id="name-input"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                    minLength={2}
                    required
                    disabled={pending}
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Salvataggio…
                        </>
                      ) : (
                        'Salva'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={cancelEditing}
                      disabled={pending}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Annulla
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-sm">{user.name ?? '—'}</p>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <Badge variant={user.emailVerified ? 'secondary' : 'outline'}>
                  {user.emailVerified ? (
                    <>
                      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                      Verificata
                    </>
                  ) : (
                    'Da verificare'
                  )}
                </Badge>
              </div>
              <p className="text-sm">{user.email ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function ProfiloPage() {
  const { isLoading, isAuthenticated } = useCurrentUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace('/admin/login')
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) return <FullPageLoader label="Caricamento profilo…" />
  if (!isAuthenticated) return <FullPageLoader label="Reindirizzamento…" />

  return <ProfiloContent />
}
