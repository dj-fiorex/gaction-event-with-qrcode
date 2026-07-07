'use client'

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/lib/use-current-user'

export function SiteHeader() {
  const { user, isLoading } = useCurrentUser()

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Eventi Aziendali</span>
        </Link>
        <div className="flex items-center gap-2">
          {!isLoading && user?.role === 'member' ? (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/profilo" />}
            >
              {user.name ?? user.email ?? 'Profilo'}
            </Button>
          ) : !isLoading && !user ? (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/accedi" />}
            >
              Accedi
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/admin">Area riservata</Link>}
          />
        </div>
      </div>
    </header>
  )
}
