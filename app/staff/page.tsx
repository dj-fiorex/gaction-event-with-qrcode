'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { CalendarClock, Lock, MapPin, ScanLine } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { AuthGate } from '@/components/auth/auth-gate'
import { AdminHeader } from '@/components/admin/admin-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateRange } from '@/lib/format'
import type { Role } from '@/lib/types'

function StaffContent({ role }: { role: Role }) {
  const events = useQuery(api.events.listOperable)

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader role={role} />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Check-in eventi</h1>
          <p className="text-muted-foreground">
            Seleziona un evento per aprire la relativa interfaccia di scansione.
          </p>
        </div>

        {events === undefined ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nessun evento disponibile.
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event) => (
              <li key={event.id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-balance">{event.title}</CardTitle>
                      <Badge variant={event.checkInAccess === 'password' ? 'secondary' : 'outline'}>
                        {event.checkInAccess === 'password' ? (
                          <>
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            Password
                          </>
                        ) : (
                          'Privato'
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
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
                    <Button
                      className="w-fit"
                      nativeButton={false}
                      render={<Link href={`/scan/${event.scanToken}`} />}
                    >
                      <ScanLine className="h-4 w-4" aria-hidden="true" />
                      Apri check-in
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

export default function StaffPage() {
  return (
    <AuthGate>
      {(role) => <StaffContent role={role} />}
    </AuthGate>
  )
}
