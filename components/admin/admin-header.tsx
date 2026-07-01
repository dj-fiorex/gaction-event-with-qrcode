import Link from 'next/link'
import { CalendarCheck, LogOut, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/lib/actions'

export function AdminHeader() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>Pannello admin</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/admin/validazione" />}
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Valida ticket
          </Button>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Esci
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
