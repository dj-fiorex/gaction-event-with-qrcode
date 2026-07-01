import { redirect } from 'next/navigation'
import { AdminHeader } from '@/components/admin/admin-header'
import { TicketValidator } from '@/components/admin/ticket-validator'
import { isAuthenticated } from '@/lib/auth'

export default async function ValidationPage() {
  if (!(await isAuthenticated())) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader />
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Validazione accessi</h1>
          <p className="text-muted-foreground">
            Scansiona il QR code del ticket per verificare l&apos;accesso. Al primo utilizzo il
            ticket viene invalidato automaticamente.
          </p>
        </div>
        <TicketValidator />
      </main>
    </div>
  )
}
