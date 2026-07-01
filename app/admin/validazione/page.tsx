import { redirect } from 'next/navigation'
import { AdminHeader } from '@/components/admin/admin-header'
import { TicketValidator } from '@/components/admin/ticket-validator'
import { getRole } from '@/lib/auth'
import { getEvents } from '@/lib/queries'

export default async function ValidationPage() {
  const role = await getRole()
  if (!role) {
    redirect('/admin/login')
  }

  const events = getEvents()

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader role={role} />
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Validazione accessi</h1>
          <p className="text-muted-foreground">
            Scansiona o inserisci il codice del QR. Scegli se registrare l&apos;ingresso
            all&apos;evento oppure l&apos;accesso a una singola attività.
          </p>
        </div>
        <TicketValidator events={events} />
      </main>
    </div>
  )
}
