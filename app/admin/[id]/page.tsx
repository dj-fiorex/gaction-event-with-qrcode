'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from 'convex/react'
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
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { AuthGate } from '@/components/auth/auth-gate'
import { AdminHeader } from '@/components/admin/admin-header'
import { CheckInAccessCard } from '@/components/admin/check-in-access-card'
import { DeclinesCard } from '@/components/admin/declines-card'
import { EmbedCard } from '@/components/admin/embed-card'
import { EventActivityMonitor } from '@/components/admin/event-activity-monitor'
import { EventPersonsTable } from '@/components/admin/event-persons-table'
import { ExportButton } from '@/components/admin/export-button'
import { PdfDownloadButton } from '@/components/admin/pdf-download-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateRange } from '@/lib/format'
import { downloadAllTickets } from '@/lib/pdf/download-tickets'
import { toRegisteredPersons } from '@/lib/qr-client'
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

function EventDetailContent() {
  const params = useParams<{ id: string }>()
  const eventId = params.id as Id<'events'>
  const event = useQuery(api.events.getForAdmin, { eventId })
  const activities = useQuery(api.attendance.getActivityAttendance, { eventId })
  const registrations = useQuery(api.registrations.listAll, { eventId })
  const declines = useQuery(api.declines.list, { eventId })

  if (event === undefined) {
    return (
      <div className="min-h-svh bg-muted/40">
        <AdminHeader role="admin" />
        <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-64" />
        </main>
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="min-h-svh bg-muted/40">
        <AdminHeader role="admin" />
        <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
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
          <p className="text-muted-foreground">Evento non trovato.</p>
        </main>
      </div>
    )
  }

  const policyDescription =
    event.activityPolicy === 'min'
      ? `${POLICY_LABEL.min} (min ${event.minActivities})`
      : POLICY_LABEL[event.activityPolicy]

  /**
   * Le impostazioni che parlano di Attività — policy, minimo, sovrapposizioni,
   * tolleranza — e il tetto di posti hanno senso solo se un'Attività c'è
   * (ADR 0010). Senza, non si annunciano: la capienza è un concetto dello
   * Slot, e i numeri veri l'admin li legge in «Persone totali dentro» e
   * «Registrazioni».
   */
  const hasActivities = event.activities.length > 0

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
            <div className="flex items-start gap-4">
              {event.imageUrl && (
                <div className="relative aspect-[16/9] w-32 shrink-0 overflow-hidden rounded-md border border-border sm:w-40">
                  <Image
                    src={event.imageUrl}
                    alt={`Immagine di copertina di ${event.title}`}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-balance">
                    {event.title}
                  </h1>
                {hasActivities && (
                  <Badge variant="secondary">{POLICY_LABEL[event.activityPolicy]}</Badge>
                )}
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton
                registrations={registrations ?? []}
                events={[event]}
                eventId={event.id}
                declines={declines ?? []}
                disabled={registrations === undefined || event.registrationsCount === 0}
              />
              <PdfDownloadButton
                onDownload={async () => {
                  const persons = (registrations ?? []).flatMap((r) => r.persons)
                  if (persons.length === 0) throw new Error('Nessun biglietto da generare')
                  const registeredPersons = await toRegisteredPersons(persons)
                  await downloadAllTickets(registeredPersons, {
                    title: event.title,
                    location: event.location,
                    dateRange: formatDateRange(event.startsAt, event.endsAt),
                    imageUrl: event.imageUrl,
                  })
                }}
                label="Scarica biglietti (PDF)"
                successMessage="Biglietti dell'evento pronti"
                disabled={event.registrationsCount === 0}
              />
              <Button nativeButton={false} render={<Link href={`/admin/${event.id}/edit`} />}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Modifica evento
              </Button>
            </div>
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
            label={hasActivities ? 'Posti liberi / totali' : 'Posti'}
            value={hasActivities ? `${event.totalAvailable}/${event.totalCapacity}` : 'Illimitati'}
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
              {hasActivities && (
                <>
                  <InfoRow label="Politica attività" value={policyDescription} />
                  <InfoRow
                    label="Sovrapposizione slot"
                    value={event.allowOverlap ? 'Consentita' : 'Non consentita'}
                  />
                  <InfoRow
                    label="Tolleranza check-in"
                    value={`${event.checkInToleranceMinutes} min`}
                  />
                </>
              )}
              <InfoRow
                label="Bambini"
                value={
                  event.allowChildren
                    ? `Fino a ${event.maxChildrenPerRegistration} per registrazione`
                    : 'Non ammessi'
                }
              />
              <InfoRow
                label="Ospiti"
                value={
                  event.allowCompanions
                    ? `Fino a ${event.maxCompanionsPerRegistration} per registrazione`
                    : 'Non ammessi'
                }
              />
              <InfoRow
                label="Regola nucleo familiare"
                value={
                  event.maxCompanionsWithChildren !== null
                    ? `Con figli: max ${event.maxCompanionsWithChildren} ospiti`
                    : 'Non attiva'
                }
              />
              <InfoRow
                label="Allergie e intolleranze"
                value={event.collectAllergies ? 'Richieste a ogni persona' : 'Non richieste'}
              />
              {hasActivities && (
                <InfoRow
                  label="Posti occupati"
                  value={`${event.totalTaken}/${event.totalCapacity}`}
                />
              )}
            </dl>
          </CardContent>
        </Card>

        <CheckInAccessCard
          eventId={event.id}
          scanToken={event.scanToken}
          checkInAccess={event.checkInAccess}
          hasCheckInPassword={event.hasCheckInPassword}
        />

        <EmbedCard
          eventId={event.id}
          embedEnabled={event.embedEnabled}
          allowedOrigins={event.allowedOrigins}
        />

        <DeclinesCard declines={declines ?? []} />

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Persone</h2>
            <p className="text-sm text-muted-foreground">
              Stato di ogni persona: ingresso all&apos;evento, visita alle attività e uscita.
            </p>
          </div>
          <EventPersonsTable registrations={registrations ?? []} />
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Attività e slot</h2>
            <p className="text-sm text-muted-foreground">
              Presenze per attività e slot attualmente in corso.
            </p>
          </div>
          <EventActivityMonitor activities={activities ?? []} />
        </section>
      </main>
    </div>
  )
}

export default function EventDetailPage() {
  return (
    <AuthGate require="admin">
      {() => <EventDetailContent />}
    </AuthGate>
  )
}
