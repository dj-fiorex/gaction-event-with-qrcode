'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { RegisteredPerson } from '@/lib/actions'
import type { TicketPdfEvent } from '@/lib/pdf/ticket-document'
import { downloadAllTickets, downloadPersonTicket } from '@/lib/pdf/download-tickets'

const CATEGORY_LABEL: Record<RegisteredPerson['category'], string> = {
  user: 'Iscritto',
  child: 'Figlio',
  companion: 'Accompagnatore',
}

interface TicketResultProps {
  persons: RegisteredPerson[]
  event: TicketPdfEvent
  onReset: () => void
}

export function TicketResult({ persons, event, onReset }: TicketResultProps) {
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null)

  async function handleDownloadAll() {
    setDownloadingAll(true)
    try {
      await downloadAllTickets(persons, event)
    } catch {
      toast.error('Impossibile generare il PDF. Riprova.')
    } finally {
      setDownloadingAll(false)
    }
  }

  async function handleDownloadPerson(person: RegisteredPerson) {
    setDownloadingCode(person.ticketCode)
    try {
      await downloadPersonTicket(person, event)
    } catch {
      toast.error('Impossibile generare il PDF. Riprova.')
    } finally {
      setDownloadingCode(null)
    }
  }

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
                ? 'È stato generato 1 QR code. Mostralo all\u2019ingresso o scarica il PDF.'
                : `Sono stati generati ${persons.length} QR code, uno per ogni persona. Scarica il PDF di riepilogo o quello singolo.`}
            </p>
          </div>
        </div>

        <Button onClick={handleDownloadAll} disabled={downloadingAll} className="w-full sm:w-auto">
          {downloadingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {persons.length === 1 ? 'Scarica biglietto (PDF)' : 'Scarica tutti i biglietti (PDF)'}
        </Button>

        <ul className="grid w-full gap-4 sm:grid-cols-2">
          {persons.map((person) => {
            const isDownloading = downloadingCode === person.ticketCode
            return (
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPerson(person)}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  Scarica PDF
                </Button>
              </li>
            )
          })}
        </ul>

        <p className="text-center text-sm text-muted-foreground">
          Evento: <span className="font-medium text-foreground">{event.title}</span>
        </p>
        <Button variant="outline" onClick={onReset}>
          Nuova registrazione
        </Button>
      </CardContent>
    </Card>
  )
}
