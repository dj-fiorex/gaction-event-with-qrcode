import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Layers,
  MapPin,
  Pencil,
  Ticket,
  Users,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-header'
import { CheckInAccessCard } from '@/components/admin/check-in-access-card'
import { EventActivityMonitor } from '@/components/admin/event-activity-monitor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getRole } from '@/lib/auth'
import { formatDateRange } from '@/lib/format'
import { getActivityAttendance, getEvent } from '@/lib/queries'
import type { EventWithStats } from '@/lib/types'

const POLICY_LABEL: Record<EventWithStats['activityPolicy'], string> = {
  all: 'Tutte le attività obbligatorie',
  min: 'Numero minimo di attività',
  free: 'Selezione libera',
}

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
          {icon}
        </span>
        <div>
          <p className="text-2xl font-semibold leading-none tabular-nums">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  const activities = getActivityAttendance(id)

  const policyDescription =
    event.activityPolicy === 'min'
      ? `${POLICY_LABEL.min} (min ${event.minActivities})`
      : POLICY_LABEL[event.activityPolicy]

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader role="admin" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-3">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="w-fit"
            render={<Link href="/admin" />}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Torna alla dashboard
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-balance">
                  {event.title}
                </h1>
                <Badge variant="secondary">{POLICY_LABEL[event.activityPolicy]}</Badge>
                {event.soldOut && <Badge variant="destructive">Esaurito</Badge>}
              </div>
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
            </div>
            <Button nativeButton={false} render={<Link href={`/admin/${event.id}/edit`} />}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Modifica evento
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Persone totali dentro"
            value={event.personsCount}
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
          />
          <StatCard
            label="Registrazioni"
            value={event.registrationsCount}
            icon={<Ticket className="h-5 w-5" aria-hidden="true" />}
          />
          <StatCard
            label="Attività"
            value={event.activities.length}
            icon={<Layers className="h-5 w-5" aria-hidden="true" />}
          />
          <StatCard
            label="Posti liberi / totali"
            value={`${event.totalAvailable}/${event.totalCapacity}`}
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informazioni base</CardTitle>
            {event.description && <CardDescription>{event.description}</CardDescription>}
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoRow label="Luogo" value={event.location} />
              <InfoRow label="Data e orario" value={formatDateRange(event.startsAt, event.endsAt)} />
              <InfoRow label="Politica attività" value={policyDescription} />
              <InfoRow
                label="Sovrapposizione slot"
                value={event.allowOverlap ? 'Consentita' : 'Non consentita'}
              />
              <InfoRow
                label="Tolleranza check-in"
                value={`${event.checkInToleranceMinutes} min`}
              />
              <InfoRow
                label="Bambini"
                value={
                  event.allowChildren
                    ? `Fino a ${event.maxChildrenPerRegistration} per registrazione`
                    : 'Non ammessi'
                }
              />
              <InfoRow
                label="Accompagnatori"
                value={
                  event.allowCompanions
                    ? `Fino a ${event.maxCompanionsPerRegistration} per registrazione`
                    : 'Non ammessi'
                }
              />
              <InfoRow
                label="Posti occupati"
                value={`${event.totalTaken}/${event.totalCapacity}`}
              />
            </dl>
          </CardContent>
        </Card>

        <CheckInAccessCard
          eventId={event.id}
          scanToken={event.scanToken}
          checkInAccess={event.checkInAccess}
          hasCheckInPassword={event.hasCheckInPassword}
        />

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Attività e slot</h2>
            <p className="text-sm text-muted-foreground">
              Presenze per attività e slot attualmente in corso.
            </p>
          </div>
          <EventActivityMonitor activities={activities} />
        </section>
      </main>
    </div>
  )
}
