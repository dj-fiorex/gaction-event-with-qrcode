'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthActions } from '@convex-dev/auth/react'
import { CalendarCheck, LayoutDashboard, LogOut, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Role } from '@/lib/types'

export function AdminHeader({ role }: { role: Role }) {
  const router = useRouter()
  const { signOut } = useAuthActions()
  const isAdmin = role === 'admin'

  async function handleSignOut() {
    await signOut()
    router.replace('/admin/login')
  }

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href={isAdmin ? '/admin' : '/staff'} className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>{isAdmin ? 'Pannello admin' : 'Check-in staff'}</span>
        </Link>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin" />}>
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/admin/account" />}
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Account
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Esci
          </Button>
        </div>
      </div>
    </header>
  )
}
