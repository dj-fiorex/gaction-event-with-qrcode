'use client'

import { useEffect, useState } from 'react'
import { notFound, useParams, useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { CalendarClock, MapPin, ScanLine } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { TicketValidator } from '@/components/admin/ticket-validator'
import { ScanPasswordGate } from '@/components/scan/scan-password-gate'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/lib/use-current-user'
import { formatDateRange } from '@/lib/format'

function unlockStorageKey(token: string) {
  return `scan-unlock:${token}`
}

export default function ScanPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const event = useQuery(api.events.getByScanToken, { token })
  const { user, isLoading: userLoading } = useCurrentUser()
  const [unlockToken, setUnlockToken] = useState<string | null>(null)

  useEffect(() => {
    setUnlockToken(sessionStorage.getItem(unlockStorageKey(token)))
  }, [token])

  const isPrivate = event?.checkInAccess === 'private'

  useEffect(() => {
    if (event === undefined || userLoading) return
    if (event && isPrivate && !user) {
      router.replace(`/admin/login?redirect=/scan/${token}`)
    }
  }, [event, isPrivate, user, userLoading, router, token])

  if (event === null) notFound()

  if (event === undefined || userLoading) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-12">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </main>
    )
  }

  if (isPrivate && !user) {
    return null
  }

  const unlocked = user !== null || unlockToken !== null
  if (event.checkInAccess === 'password' && !unlocked) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
        <ScanPasswordGate
          scanToken={event.scanToken}
          eventTitle={event.title}
          onUnlocked={(newToken) => {
            sessionStorage.setItem(unlockStorageKey(token), newToken)
            setUnlockToken(newToken)
          }}
        />
      </main>
    )
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ScanLine className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>Check-in</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{event.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              {formatDateRange(event.startsAt, event.endsAt)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {event.location}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Scansiona o inserisci il codice del QR. Scegli se registrare l&apos;ingresso
            all&apos;evento oppure l&apos;accesso a una singola attività.
          </p>
        </div>
        <TicketValidator event={event} unlockToken={unlockToken} />
      </main>
    </div>
  )
}
