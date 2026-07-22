import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format'
import type { Decline } from '@/lib/types'

interface DeclinesCardProps {
  declines: Decline[]
}

/** Elenco delle Rinunce (ADR 0004) per un Evento: conteggio, nome, email, quando. */
export function DeclinesCard({ declines }: DeclinesCardProps) {
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
