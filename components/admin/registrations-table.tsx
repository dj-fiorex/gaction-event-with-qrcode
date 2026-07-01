import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/format'
import type { Registration } from '@/lib/types'

interface RegistrationsTableProps {
  registrations: Registration[]
}

export function RegistrationsTable({ registrations }: RegistrationsTableProps) {
  if (registrations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nessuna registrazione presente.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dipendente</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Reparto</TableHead>
            <TableHead className="text-center">Bambini</TableHead>
            <TableHead>Ticket</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Registrato il</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrations.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.employeeName}</TableCell>
              <TableCell className="text-muted-foreground">{r.employeeEmail}</TableCell>
              <TableCell>{r.department}</TableCell>
              <TableCell className="text-center">{r.children.length}</TableCell>
              <TableCell className="font-mono text-xs">{r.ticketCode}</TableCell>
              <TableCell>
                {r.used ? (
                  <Badge variant="secondary">Utilizzato</Badge>
                ) : (
                  <Badge>Valido</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDateTime(r.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
