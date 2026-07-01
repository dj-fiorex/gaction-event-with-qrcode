'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { AuthGate } from '@/components/auth/auth-gate'
import { AdminHeader } from '@/components/admin/admin-header'
import { EventForm } from '@/components/admin/event-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toDatetimeLocalValue } from '@/lib/format'
import type { EventInput } from '@/lib/schemas'
import type { EventWithStats } from '@/lib/types'

function toEventInput(event: EventWithStats): EventInput {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    activityPolicy: event.activityPolicy,
    minActivities: event.activityPolicy === 'min' ? event.minActivities : 1,
    allowOverlap: event.allowOverlap,
    checkInToleranceMinutes: event.checkInToleranceMinutes,
    allowQrReuse: event.allowQrReuse,
    allowChildren: event.allowChildren,
    maxChildrenPerRegistration: event.maxChildrenPerRegistration || 2,
    allowCompanions: event.allowCompanions,
    maxCompanionsPerRegistration: event.maxCompanionsPerRegistration || 1,
    checkInAccess: event.checkInAccess,
    checkInPassword: '',
    activities: event.activities.map((activity) => ({
      title: activity.title,
      start: toDatetimeLocalValue(activity.start),
      end: toDatetimeLocalValue(activity.end),
      slotDurationMinutes: activity.slotDurationMinutes,
      capacityPerSlot: activity.capacityPerSlot,
    })),
  }
}

function EditEventContent() {
  const params = useParams<{ id: string }>()
  const event = useQuery(api.events.getForAdmin, { eventId: params.id as Id<'events'> })

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader role="admin" />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-3">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="w-fit"
            render={<Link href={event ? `/admin/${event.id}` : '/admin'} />}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Torna al dettaglio evento
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Modifica evento</h1>
            <p className="text-muted-foreground">{event?.title ?? '...'}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dettagli evento</CardTitle>
            <CardDescription>
              Salvando, gli slot delle attività vengono rigenerati in base ai nuovi orari.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {event === undefined ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-24" />
              </div>
            ) : event === null ? (
              <p className="text-sm text-muted-foreground">Evento non trovato.</p>
            ) : (
              <EventForm
                mode="edit"
                eventId={event.id}
                initialValues={toEventInput(event)}
                hasCheckInPassword={event.hasCheckInPassword}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function EditEventPage() {
  return (
    <AuthGate requireRole="admin">
      <EditEventContent />
    </AuthGate>
  )
}
