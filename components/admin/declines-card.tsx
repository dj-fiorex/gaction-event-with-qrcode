'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import type { Decline } from '@/lib/types'

interface DeclinesCardProps {
  declines: Decline[]
}

/** Elenco delle Rinunce (ADR 0004) per un Evento: conteggio, nome, email, quando. */
export function DeclinesCard({ declines }: DeclinesCardProps) {
  const removeDecline = useMutation(api.declines.remove)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleRemove(id: string, email: string) {
    if (
      !window.confirm(
        `Rimuovere la rinuncia di "${email}"? L'email tornerà libera di prenotare questo evento.`,
      )
    ) {
      return
    }
    setRemovingId(id)
    try {
      await removeDecline({ declineId: id as Id<'declines'> })
      toast.success('Rinuncia rimossa')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rimozione non riuscita')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rinunce ({declines.length})</CardTitle>
        <CardDescription>Persone che hanno dichiarato di non partecipare.</CardDescription>
      </CardHeader>
      <CardContent>
        {declines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna rinuncia registrata.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {declines.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(d.respondedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Rimozione della Rinuncia (ADR 0005): rimedio quando chi ha
                          risposto «no» scrive all'organizzatore per cambiare idea. */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleRemove(d.id, d.email)}
                        disabled={removingId === d.id}
                        aria-label={`Rimuovi rinuncia di ${d.email}`}
                        title={`Rimuovi rinuncia di ${d.email}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
