'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { AlertTriangle, CalendarDays, Plus, Ticket, Users } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { AuthGate } from '@/components/auth/auth-gate'
import { AdminHeader } from '@/components/admin/admin-header'
import { AdminEventList } from '@/components/admin/admin-event-list'
import { ExportButton } from '@/components/admin/export-button'
import { RegistrationsTable } from '@/components/admin/registrations-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { eventCreationDisabled } from '@/lib/feature-flags'
import { deliveryNeedsAttention } from '@/lib/email-delivery'

interface StatCardProps {
  label: string
  value: number
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
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function AdminDashboard() {
  const events = useQuery(api.events.listForAdmin)
  const registrations = useQuery(api.registrations.listAll, {})
  const declines = useQuery(api.declines.list, {})

  const loading = events === undefined || registrations === undefined
  const totalPersons = registrations?.reduce((sum, r) => sum + r.persons.length, 0) ?? 0

  // Consegne dell'email di conferma che chiedono attenzione (ADR 0016). È la
  // parte che fa il lavoro vero: il guasto dominante — dominio non verificato,
  // quota esaurita, RESEND_API_KEY assente in produzione — non rompe *una*
  // Prenotazione, le rompe tutte, e duecento icone identiche non sono un
  // allarme ma carta da parati.
  const now = Date.now()
  const deliveriesNeedingAttention =
    registrations?.filter((r) => deliveryNeedsAttention(r.emailDelivery, now)).length ?? 0

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader role="admin" />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Gestione eventi e registrazioni.</p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Eventi attivi"
                value={events.length}
                icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
              />
              <StatCard
                label="Registrazioni"
                value={registrations.length}
                icon={<Users className="h-5 w-5" aria-hidden="true" />}
              />
              <StatCard
                label="Persone iscritte"
                value={totalPersons}
                icon={<Ticket className="h-5 w-5" aria-hidden="true" />}
              />
            </div>

            <Tabs defaultValue="registrations">
              <TabsList>
                <TabsTrigger value="registrations">Registrazioni</TabsTrigger>
                <TabsTrigger value="events">Eventi</TabsTrigger>
              </TabsList>

              <TabsContent value="registrations" className="mt-4">
                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle>Utenti registrati</CardTitle>
                      <CardDescription>
                        Elenco completo delle registrazioni a tutti gli eventi.
                      </CardDescription>
                      {deliveriesNeedingAttention > 0 && (
                        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
                          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {/* Non «non sono arrivate»: fra queste ci sono le
                              consegne rimaste in corso, di cui sappiamo solo
                              che non ne abbiamo più saputo nulla. È la stessa
                              bugia per cui l'ADR 0016 ha scartato il cron. */}
                          {deliveriesNeedingAttention === 1
                            ? '1 email di conferma da controllare'
                            : `${deliveriesNeedingAttention} email di conferma da controllare`}
                        </p>
                      )}
                    </div>
                    <ExportButton
                      registrations={registrations}
                      events={events}
                      declines={declines ?? []}
                      disabled={registrations.length === 0}
                    />
                  </CardHeader>
                  <CardContent>
                    <RegistrationsTable registrations={registrations} events={events} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="events" className="mt-4 flex flex-col gap-6">
                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle>Eventi esistenti</CardTitle>
                      <CardDescription>
                        Consulta disponibilità e gestisci gli eventi.
                      </CardDescription>
                    </div>
                    {!eventCreationDisabled && (
                      <Button nativeButton={false} size="sm" render={<Link href="/admin/new" />}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Nuovo evento
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <AdminEventList events={events} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  )
}

export default function AdminPage() {
  return <AuthGate require="admin">{() => <AdminDashboard />}</AuthGate>
}
