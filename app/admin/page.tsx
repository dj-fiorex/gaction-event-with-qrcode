import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, Plus, Ticket, Users } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-header'
import { AdminEventList } from '@/components/admin/admin-event-list'
import { ExportButton } from '@/components/admin/export-button'
import { RegistrationsTable } from '@/components/admin/registrations-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getRole } from '@/lib/auth'
import { getEvents, getRegistrations } from '@/lib/queries'

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

export default async function AdminPage() {
  const role = await getRole()
  if (!role) {
    redirect('/admin/login')
  }
  if (role !== 'admin') {
    redirect('/staff')
  }

  const events = getEvents()
  const registrations = getRegistrations()
  const totalPersons = registrations.reduce((sum, r) => sum + r.persons.length, 0)

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader role="admin" />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Gestione eventi e registrazioni.</p>
        </div>

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
                </div>
                <ExportButton disabled={registrations.length === 0} />
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
                  <CardDescription>Consulta disponibilità e gestisci gli eventi.</CardDescription>
                </div>
                <Button nativeButton={false} size="sm" render={<Link href="/admin/new" />}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuovo evento
                </Button>
              </CardHeader>
              <CardContent>
                <AdminEventList events={events} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
