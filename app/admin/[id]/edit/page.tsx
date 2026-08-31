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
    imageStorageId: event.imageStorageId ?? undefined,
    // La dichiarazione, non la data risolta (ADR 0009): rimettere in campo una
    // data derivata la congelerebbe in dichiarazione al primo salvataggio, e
    // da lì spostare un'Attività non sposterebbe più l'Evento.
    startsAt: event.declaredStartsAt ? toDatetimeLocalValue(event.declaredStartsAt) : '',
    endsAt: event.declaredEndsAt ? toDatetimeLocalValue(event.declaredEndsAt) : '',
    activityPolicy: event.activityPolicy,
    minActivities: event.activityPolicy === 'min' ? event.minActivities : 1,
    allowOverlap: event.allowOverlap,
    checkInToleranceMinutes: event.checkInToleranceMinutes,
    allowQrReuse: event.allowQrReuse,
    requireAccount: event.requireAccount,
    confirmParticipation: event.confirmParticipation,
    collectNames: event.collectNames,
    collectAllergies: event.collectAllergies,
    recordExit: event.recordExit,
    emailSubject: event.emailSubject,
    emailBody: event.emailBody,
    allowChildren: event.allowChildren,
    maxChildrenPerRegistration: event.maxChildrenPerRegistration || 2,
    allowCompanions: event.allowCompanions,
    maxCompanionsPerRegistration: event.maxCompanionsPerRegistration || 1,
    maxCompanionsWithChildren: event.maxCompanionsWithChildren ?? undefined,
    checkInAccess: event.checkInAccess,
    checkInPassword: '',
    activities: event.activities.map((activity) => ({
      // Identità dell'Attività (ADR 0008): senza id il salvataggio la
      // ricreerebbe da capo, sganciando le Prenotazioni già fatte.
      id: activity.id,
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
  const eventId = params.id as Id<'events'>
  const event = useQuery(api.events.getForAdmin, { eventId })
  // Chi perderebbe la selezione se un'Attività o una sua fascia sparisse:
  // serve all'avviso che il form mostra prima di salvare (ADR 0008).
  const activityImpact = useQuery(api.events.activityRegistrationImpact, { eventId })

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
              Attività e slot conservano la propria identità: salvando senza toccare il programma
              non cambia nulla per chi ha già prenotato. Le selezioni si perdono solo per le
              attività e le fasce che spariscono davvero — un&rsquo;attività rimossa, oppure orari
              o durata che non generano più quella fascia — e prima di salvare vieni avvisato di
              quante prenotazioni e persone colpisce. Le prenotazioni, i biglietti e i check-in
              già registrati restano validi.
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
                initialImageUrl={event.imageUrl}
                hasCheckInPassword={event.hasCheckInPassword}
                activityImpact={activityImpact}
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
    <AuthGate require="admin">
      {() => <EditEventContent />}
    </AuthGate>
  )
}
