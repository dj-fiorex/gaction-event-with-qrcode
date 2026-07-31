'use client'

import { useState, type FormEvent } from 'react'
import { useAction, useMutation } from 'convex/react'
import { Mail } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateRange } from '@/lib/format'
import { buildTicketsEmailPdf } from '@/lib/pdf/email-attachment'
import { toRegisteredPersons } from '@/lib/qr-client'

interface ResendTicketsDialogProps {
  registrationId: string
  /** Email di contatto memorizzata sulla Prenotazione: precompila il campo. */
  contactEmail: string
}

/**
 * Reinvio dell'email dei biglietti di una Prenotazione (issue #40).
 *
 * Il destinatario è precompilato con l'email memorizzata ed è modificabile: una
 * correzione viene salvata sulla Prenotazione dalla mutation, così vale anche
 * per le comunicazioni future e non solo per questo invio.
 */
export function ResendTicketsDialog({ registrationId, contactEmail }: ResendTicketsDialogProps) {
  const prepareResend = useMutation(api.registrations.prepareTicketResend)
  const sendTickets = useAction(api.emails.sendTickets)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(contactEmail)
  const [sending, setSending] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    // Riapre sempre sull'email memorizzata: dopo una correzione è quella nuova,
    // dopo un annullamento non resta una bozza mai inviata.
    if (nextOpen) setEmail(contactEmail)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    try {
      // La mutation valida il destinatario, persiste l'eventuale correzione e
      // restituisce il payload costruito dalle Persone attuali.
      const payload = await prepareResend({
        registrationId: registrationId as Id<'registrations'>,
        contactEmail: email,
      })
      // I QR sono rigenerati qui dai ticketCode originali, come alla prima
      // registrazione: il biglietto già in mano all'Utente resta valido.
      const persons = await toRegisteredPersons(payload.persons)
      // Stesso allegato della prima email: il PDF con una pagina per Persona.
      const pdf = await buildTicketsEmailPdf(persons, {
        title: payload.eventTitle,
        location: payload.eventLocation,
        dateRange: formatDateRange(payload.eventStartsAt, payload.eventEndsAt),
        imageUrl: payload.eventImageUrl,
      })
      const result = await sendTickets({
        eventTitle: payload.eventTitle,
        eventLocation: payload.eventLocation,
        contactEmail: payload.contactEmail,
        collectNames: payload.collectNames,
        persons,
        pdf,
      })

      if (!result.delivered && !result.simulated) {
        // Il dialog resta aperto: l'indirizzo è già stato salvato, ma l'email
        // non è partita e l'admin deve poter ritentare senza ridigitarlo.
        toast.error('Invio non riuscito: indirizzo salvato, riprova')
        return
      }

      toast.success(
        result.simulated
          ? `Invio simulato verso ${payload.contactEmail}: nessun provider email configurato`
          : `Biglietti inviati a ${payload.contactEmail}`,
      )
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invio non riuscito')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label={`Reinvia i biglietti di ${contactEmail}`}
            title={`Reinvia i biglietti di ${contactEmail}`}
          />
        }
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent render={<form onSubmit={handleSubmit} />}>
        <DialogHeader>
          <DialogTitle>Reinvia i biglietti</DialogTitle>
          <DialogDescription>
            Rimanda l&rsquo;email con un QR per ogni persona della prenotazione e il PDF dei
            biglietti in allegato. Se correggi
            l&rsquo;indirizzo, viene salvato sulla prenotazione e usato anche per le
            comunicazioni future.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="resend-email">Destinatario</Label>
          <Input
            id="resend-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={sending}
          />
        </div>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" disabled={sending} />}
          >
            Annulla
          </DialogClose>
          <Button type="submit" disabled={sending}>
            {sending ? 'Invio in corso…' : 'Invia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
