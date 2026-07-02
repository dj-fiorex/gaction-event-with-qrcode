'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AuthGate } from '@/components/auth/auth-gate'
import { AdminHeader } from '@/components/admin/admin-header'
import { EventForm } from '@/components/admin/event-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewEventPage() {
  return (
    <AuthGate require="admin">
      {() => (
      <div className="min-h-svh bg-muted/40">
        <AdminHeader role="admin" />
        <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
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
              <h1 className="text-2xl font-semibold tracking-tight">Nuovo evento</h1>
              <p className="text-muted-foreground">
                Crea un evento e rendilo disponibile alle registrazioni.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dettagli evento</CardTitle>
              <CardDescription>
                Ogni attività genera automaticamente gli slot dalla durata indicata.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EventForm mode="create" />
            </CardContent>
          </Card>
        </main>
      </div>
      )}
    </AuthGate>
  )
}
