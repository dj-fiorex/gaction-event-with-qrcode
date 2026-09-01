'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MomentValue } from '@/components/admin/check-in-moment'
import { CATEGORY_LABEL } from '@/lib/person-labels'
import { fullName } from '@/lib/person-name'
import { statusOfPerson } from '@/lib/person-status'
import type { Registration } from '@/lib/types'

interface EventPersonsTableProps {
  registrations: Registration[]
}

/**
 * Stato consolidato per Persona (issue #39): la stessa storia che lo scanner
 * racconta all'operatore, qui per l'admin e su tutte le Persone dell'Evento —
 * etichetta o nome, età, allergie e i tre momenti di Check-in.
 */
export function EventPersonsTable({ registrations }: EventPersonsTableProps) {
  const rows = registrations.flatMap((r) =>
    r.persons.map((person) => ({
      person,
      status: statusOfPerson(person, person.activityCheckIns),
    })),
  )

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nessuna persona registrata a questo evento.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-center">Età</TableHead>
            <TableHead>Allergie</TableHead>
            <TableHead>Ingresso</TableHead>
            <TableHead>Visita</TableHead>
            <TableHead>Uscita</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ person, status }) => (
            <TableRow key={person.id}>
              {/* Nome o Etichetta posizionale (issue #36): la Persona è già
                  identificata dal proprio nome, qualunque dei due contenga. Il
                  cognome c'è solo per l'Iscritto (ADR 0017). */}
              <TableCell className="font-medium">{fullName(person)}</TableCell>
              <TableCell className="text-muted-foreground">
                {CATEGORY_LABEL[person.category]}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {person.age != null ? person.age : '—'}
              </TableCell>
              {/* Allergie e intolleranze (issue #37): dato sanitario, esposto
                  all'admin per scelta esplicita del committente. */}
              <TableCell className="max-w-56 text-sm">{person.allergies ?? '—'}</TableCell>
              <TableCell className="text-sm">
                <MomentValue moment={status.entry} format="datetime" />
              </TableCell>
              <TableCell className="text-sm">
                <MomentValue moment={status.activity} format="datetime" />
              </TableCell>
              <TableCell className="text-sm">
                <MomentValue moment={status.exit} format="datetime" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
