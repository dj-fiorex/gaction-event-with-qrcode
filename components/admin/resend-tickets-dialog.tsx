'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
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
import { messageFromError } from '@/lib/errors'

interface ResendTicketsDialogProps {
  registrationId: string
  /** Email di contatto memorizzata sulla Prenotazione: precompila il campo. */
  contactEmail: string
}

/**
 * Reinvio dell'email di conferma di una Prenotazione (issue #40).
 *
 * Il destinatario è precompilato con l'email memorizzata ed è modificabile: una
 * correzione viene salvata sulla Prenotazione dalla mutation, così vale anche
 * per le comunicazioni future e non solo per questo invio.
 *
 * Qui non si costruisce più né il PDF né l'email: il reinvio **pianifica** una
 * nuova Consegna e finisce lì (ADR 0015). Il bottone conferma quindi che
 * l'invio è stato messo in coda, non che è arrivato — l'esito compare accanto
 * al Contatto, nella riga, appena il provider risponde.
 */
export function ResendTicketsDialog({ registrationId, contactEmail }: ResendTicketsDialogProps) {
  const resendTickets = useMutation(api.registrations.resendTickets)
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
    const id = registrationId as Id<'registrations'>
    try {
      // La mutation valida il destinatario, persiste l'eventuale correzione,
      // apre la Consegna e pianifica l'invio: tutto in una transazione.
      const result = await resendTickets({ registrationId: id, contactEmail: email })
      toast.success(`Invio a ${result.contactEmail} in corso: l’esito compare nella riga`)
      setOpen(false)
    } catch (error) {
      // Il dialog resta aperto solo sul rifiuto della mutation (indirizzo non
      // valido, Prenotazione sparita): l'admin corregge senza ridigitare.
      toast.error(messageFromError(error, 'Invio non riuscito'))
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
            Rimanda l&rsquo;email di conferma dell&rsquo;evento, con il riepilogo della
            prenotazione e il PDF dei biglietti in allegato. Se correggi
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
