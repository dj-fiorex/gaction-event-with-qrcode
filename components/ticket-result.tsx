'use client'

import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { RegisteredPerson } from '@/lib/actions'

const CATEGORY_LABEL: Record<RegisteredPerson['category'], string> = {
  user: 'Iscritto',
  child: 'Figlio',
  companion: 'Accompagnatore',
}

interface TicketResultProps {
  persons: RegisteredPerson[]
  eventTitle: string
  onReset: () => void
}

export function TicketResult({ persons, eventTitle, onReset }: TicketResultProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-6 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-semibold">Registrazione confermata</h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {persons.length === 1
                ? 'È stato generato 1 QR code. Mostralo all\u2019ingresso.'
                : `Sono stati generati ${persons.length} QR code, uno per ogni persona. L\u2019invio email è simulato in questo ambiente.`}
            </p>
          </div>
        </div>

        <ul className="grid w-full gap-4 sm:grid-cols-2">
          {persons.map((person) => (
            <li
              key={person.ticketCode}
              className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4 text-center"
            >
              <div>
                <p className="font-medium">{person.name}</p>
                <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[person.category]}</p>
              </div>
              <Image
                src={person.qrDataUrl || '/placeholder.svg'}
                alt={`QR code di ${person.name}`}
                width={180}
                height={180}
                className="h-[180px] w-[180px]"
                unoptimized
              />
              <p className="font-mono text-xs tracking-widest">{person.ticketCode}</p>
            </li>
          ))}
        </ul>

        <p className="text-center text-sm text-muted-foreground">
          Evento: <span className="font-medium text-foreground">{eventTitle}</span>
        </p>
        <Button variant="outline" onClick={onReset}>
          Nuova registrazione
        </Button>
      </CardContent>
    </Card>
  )
}
