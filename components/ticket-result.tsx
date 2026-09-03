'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { FormAlert } from './form-alert'
import { CATEGORY_LABEL } from '@/lib/person-labels'
import { cn } from '@/lib/utils'
import { resultBody, resultClosing, resultTitle, toParagraphs } from '@/lib/result-content'
import { LinkedText } from './linked-text'
import type { RegisteredPerson } from '@/lib/types'
import { fullName } from '@/lib/person-name'
import type { TicketPdfEvent } from '@/lib/pdf/ticket-document'
import { downloadAllTickets, downloadPersonTicket } from '@/lib/pdf/download-tickets'
import type { DeliveryOutcome } from '@/lib/email-delivery'

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
  /**
   * Prenotazione a cui iscriversi per l'esito della Consegna dell'email di
   * conferma (ADR 0016). null = nessuna iscrizione, e nessun messaggio.
   */
  registrationId: Id<'registrations'> | null
  /** Destinatario da nominare a consegna riuscita: il server non lo ritorna. */
  contactEmail: string
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
  registrationId,
  contactEmail,
  showTickets,
  showNewRegistration,
  onReset,
}: TicketResultProps) {
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null)
  // Il fallimento del PDF si legge accanto al bottone che l'ha chiesto, non in
  // un toast (ADR 0021). Qui pesa più che altrove: siamo dopo la prenotazione,
  // e questo download è l'unica presa di chi non riceve l'email.
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // L'invio è passato al server e non ritorna più nulla al browser, ma Convex è
  // reattivo: restiamo iscritti e l'esito arriva dal vivo (ADR 0016). La query
  // ritorna **solo l'enum** — nessun indirizzo, nessun nome.
  const deliveryOutcome = useQuery(
    api.emailDeliveries.outcomeForRegistration,
    registrationId ? { registrationId } : 'skip',
  )

  const title = resultTitle(titleCopy)
  const body = resultBody(bodyCopy, { personsCount: persons.length, showTickets })
  const closing = resultClosing(closingCopy)

  async function handleDownloadAll() {
    setDownloadingAll(true)
    setDownloadError(null)
    try {
      await downloadAllTickets(persons, event)
    } catch {
      setDownloadError('Impossibile generare il PDF. Riprova.')
    } finally {
      setDownloadingAll(false)
    }
  }

  async function handleDownloadPerson(person: RegisteredPerson) {
    setDownloadingCode(person.ticketCode)
    setDownloadError(null)
    try {
      await downloadPersonTicket(person, event)
    } catch {
      setDownloadError('Impossibile generare il PDF. Riprova.')
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
          <ResultText text={body} className="mt-1" />
        </div>
      </div>

      <DeliveryNotice outcome={deliveryOutcome} contactEmail={contactEmail} />

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

      {/* Un solo blocco per tutti i bottoni di download: il messaggio è lo
          stesso e il tentativo è uno alla volta, quindi due righe direbbero la
          stessa cosa due volte. Sta sotto il bottone principale, che è il primo
          che si incontra scendendo. */}
      <FormAlert urgent message={downloadError} className="w-full sm:w-auto" />

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
                  <p className="font-medium">{fullName(person)}</p>
                  <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[person.category]}</p>
                </div>
                <Image
                  src={person.qrDataUrl || '/placeholder.svg'}
                  alt={`QR code di ${fullName(person)}`}
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

      {closing && <ResultText text={closing} className="text-center" />}

      {showNewRegistration && (
        <Button variant="outline" onClick={onReset}>
          Nuova registrazione
        </Button>
      )}
    </div>
  )
}

/**
 * Esito della Consegna dell'email di conferma, sotto il corpo dell'Esito e
 * sopra il bottone di download (ADR 0016).
 *
 * A consegna riuscita conferma con l'indirizzo. A guasto invita a scaricare il
 * PDF **adesso**, che è l'unico istante in cui l'Utente può ancora rimediare da
 * solo: fra dieci minuti ha chiuso la scheda e il suo ticketCode vive solo in
 * un'email che non arriverà — e vale doppio quando i biglietti a schermo sono
 * spenti e i QR non si vedono nemmeno.
 *
 * «In corso» non dice niente: dura secondi, e un avviso che compare per poi
 * sparire da sé è peggio del silenzio. `undefined` è la query non ancora
 * arrivata, `null` una Prenotazione senza Consegne registrate.
 */
function DeliveryNotice({
  outcome,
  contactEmail,
}: {
  /** undefined = query non ancora arrivata; null = nessuna Consegna registrata. */
  outcome: DeliveryOutcome | null | undefined
  contactEmail: string
}) {
  if (outcome === undefined || outcome === null || outcome === 'pending') return null

  if (outcome === 'delivered') {
    return (
      <p className="text-center text-sm text-muted-foreground text-pretty">
        Abbiamo inviato l&rsquo;email di conferma
        {contactEmail ? <> a <span className="font-medium">{contactEmail}</span></> : null}, con i
        biglietti in allegato.
      </p>
    )
  }

  // «Simulata» non è un caso da sviluppo che si possa tacere all'Utente: in
  // produzione significa che nessuna email partirà, per nessuno.
  return (
    <div
      role="status"
      className="flex w-full items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-pretty"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p>
        Non siamo riusciti a inviarti l&rsquo;email di conferma.{' '}
        <span className="font-medium">Scarica adesso i biglietti</span> con il bottone qui sotto:
        senza l&rsquo;email è l&rsquo;unico modo per conservarli.
      </p>
    </div>
  )
}

/**
 * Testo dell'Esito reso a paragrafi. I campi sono testo semplice e non
 * markdown (ADR 0014): la riga vuota separa i paragrafi, l'a capo singolo
 * resta dentro il paragrafo — lo rende `whitespace-pre-line` — e gli indirizzi
 * diventano cliccabili, perché «scrivici a info@…» dentro un iframe, su un
 * telefono, costringerebbe altrimenti a trascriverlo a mano.
 *
 * Lo stile tipografico vive **qui** e non nelle chiamate: corpo e chiusura sono
 * la stessa voce che continua, e tenerlo in due className separate li ha già
 * fatti divergere una volta — corpo attenuato, chiusura a colore pieno. Chi
 * chiama passa solo posizione e allineamento.
 */
function ResultText({ text, className }: { text: string; className?: string }) {
  const paragraphs = toParagraphs(text)
  if (paragraphs.length === 0) return null

  return (
    <div className={cn('text-sm text-muted-foreground text-pretty', className)}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={index > 0 ? 'mt-2 whitespace-pre-line' : 'whitespace-pre-line'}>
          <LinkedText text={paragraph} />
        </p>
      ))}
    </div>
  )
}
