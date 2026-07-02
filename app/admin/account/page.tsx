'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { AuthGate } from '@/components/auth/auth-gate'
import { AdminHeader } from '@/components/admin/admin-header'
import { AccountManager } from '@/components/admin/account-manager'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function AccountContent() {
  const accounts = useQuery(api.accounts.list)
  const me = useQuery(api.accounts.me)

  return (
    <div className="min-h-svh bg-muted/40">
      <AdminHeader role="admin" />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Gestione account</h1>
            <p className="text-muted-foreground">
              Crea e amministra gli account di amministratori e assistenti.
            </p>
          </div>
        </div>

        {accounts === undefined || me === undefined || me === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <AccountManager accounts={accounts} currentUserId={me.id as Id<'users'>} />
        )}
      </main>
    </div>
  )
}

export default function AccountPage() {
  return <AuthGate require="admin">{() => <AccountContent />}</AuthGate>
}
