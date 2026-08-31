'use client'

import { Fragment, useState } from 'react'
import Image from 'next/image'
import { CheckCircle2, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CATEGORY_LABEL } from '@/lib/person-labels'
import { linkify, resultBody, resultClosing, resultTitle, toParagraphs } from '@/lib/result-content'
import type { RegisteredPerson } from '@/lib/types'
import type { TicketPdfEvent } from '@/lib/pdf/ticket-document'
import { downloadAllTickets, downloadPersonTicket } from '@/lib/pdf/download-tickets'

interface TicketResultProps {
  persons: RegisteredPerson[]
  event: TicketPdfEvent
  /**
   * Esito della Prenotazione (ADR 0014): i tre testi dell'Evento. Vuoti =
   * ripiego, campo per campo — se ne occupa `lib/result-content.ts`.
   */
  resultTitle: string
  resultBody: string
  resultClosing: string
  /** false = la griglia dei biglietti non si rende (solo dentro l'iframe). */
  showTickets: boolean
  /** false = «Nuova registrazione» non si rende (solo dentro l'iframe). */
  showNewRegistration: boolean
  onReset: () => void
}

/**
 * Esito della Prenotazione: occupa lo stesso slot del form pubblico e ne
 * segue la presentazione senza contenitori (nessuna Card attorno).
 * L'unica eccezione sono i singoli biglietti: un biglietto è un oggetto
 * distinto e ripetuto, non un raggruppamento di campi, quindi tiene il suo
 * riquadro. Non aggiungere altri riquadri qui.
 *
 * L'ordine è titolo → corpo → download → biglietti → chiusura → nuova
 * registrazione, e non è arbitrario (ADR 0014): la chiusura è un commiato,
 * quindi non le va sotto una griglia di QR code; e con i due blocchi
 * spegnibili via l'ordine regge identico, senza che nulla resti appeso.
 */
export function TicketResult({
  persons,
  event,
  resultTitle: titleCopy,
  resultBody: bodyCopy,
  resultClosing: closingCopy,
  showTickets,
  showNewRegistration,
  onReset,
}: TicketResultProps) {
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null)

  const title = resultTitle(titleCopy)
  const body = resultBody(bodyCopy, { personsCount: persons.length, showTickets })
  const closing = resultClosing(closingCopy)

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
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <ResultText text={body} className="mt-1 text-sm text-muted-foreground text-pretty" />
        </div>
      </div>

      {/* Il download non è mai spegnibile: con la griglia dei biglietti via,
          questo PDF è l'unica presa che resta a chi non riceve l'email. */}
      <Button onClick={handleDownloadAll} disabled={downloadingAll} className="w-full sm:w-auto">
        {downloadingAll ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {persons.length === 1 ? 'Scarica biglietto (PDF)' : 'Scarica tutti i biglietti (PDF)'}
      </Button>

      {showTickets && (
        <ul className="grid w-full gap-4 sm:grid-cols-2">
          {persons.map((person) => {
            const isDownloading = downloadingCode === person.ticketCode
            return (
              <li
                key={person.ticketCode}
                className="flex flex-col items-center gap-3 rounded-lg border border-border p-4 text-center"
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
      )}

      {closing && <ResultText text={closing} className="text-center text-sm text-pretty" />}

      {showNewRegistration && (
        <Button variant="outline" onClick={onReset}>
          Nuova registrazione
        </Button>
      )}
    </div>
  )
}

/**
 * Testo dell'Esito reso a paragrafi. I campi sono testo semplice e non
 * markdown (ADR 0014): la riga vuota separa i paragrafi, l'a capo singolo
 * resta dentro il paragrafo — lo rende `whitespace-pre-line` — e gli indirizzi
 * diventano cliccabili, perché «scrivici a info@…» dentro un iframe, su un
 * telefono, costringerebbe altrimenti a trascriverlo a mano.
 */
function ResultText({ text, className }: { text: string; className?: string }) {
  const paragraphs = toParagraphs(text)
  if (paragraphs.length === 0) return null

  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={index > 0 ? 'mt-2 whitespace-pre-line' : 'whitespace-pre-line'}>
          {linkify(paragraph).map((segment, segmentIndex) =>
            segment.kind === 'link' ? (
              <a
                key={segmentIndex}
                href={segment.href}
                className="underline underline-offset-2"
                rel="noreferrer"
              >
                {segment.text}
              </a>
            ) : (
              <Fragment key={segmentIndex}>{segment.text}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  )
}
