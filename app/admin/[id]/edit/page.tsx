import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-header'
import { EventForm } from '@/components/admin/event-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getRole } from '@/lib/auth'
import { toDatetimeLocalValue } from '@/lib/format'
import { getEvent } from '@/lib/queries'
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

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await getRole()
  if (!role) {
    redirect('/admin/login')
  }
  if (role !== 'admin') {
    redirect('/staff')
  }

  const { id } = await params
  const event = getEvent(id)
  if (!event) {
    notFound()
  }

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
            render={<Link href={`/admin/${event.id}`} />}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Torna al dettaglio evento
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Modifica evento</h1>
            <p className="text-muted-foreground">{event.title}</p>
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
            <EventForm
              mode="edit"
              eventId={event.id}
              initialValues={toEventInput(event)}
              hasCheckInPassword={event.hasCheckInPassword}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
