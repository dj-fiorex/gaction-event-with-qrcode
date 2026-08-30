'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAction } from 'convex/react'
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { messageFromError } from '@/lib/errors'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const completeVerification = useAction(api.emailVerification.complete)
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending')
  const [message, setMessage] = useState('Verifica in corso…')

  useEffect(() => {
    const code = searchParams.get('code')?.trim()
    if (!code) {
      setStatus('error')
      setMessage('Link di verifica mancante o non valido.')
      return
    }

    let cancelled = false
    void completeVerification({ code })
      .then(() => {
        if (cancelled) return
        setStatus('success')
        setMessage('Email verificata con successo. Ora puoi continuare con il tuo account.')
      })
      .catch((error) => {
        if (cancelled) return
        setStatus('error')
        setMessage(messageFromError(error, 'Verifica non riuscita.'))
      })

    return () => {
      cancelled = true
    }
  }, [completeVerification, searchParams])

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="items-center text-center">
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {status === 'success' ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          ) : status === 'error' ? (
            <MailWarning className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          )}
        </span>
        <CardTitle>Verifica email</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center gap-3">
        <Button nativeButton={false} render={<Link href="/profilo" />}>
          Vai al profilo
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/accedi" />}>
          Accedi
        </Button>
      </CardContent>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-lg">
            <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Verifica in corso…
            </CardContent>
          </Card>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </main>
  )
}
