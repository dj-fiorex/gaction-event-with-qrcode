'use client'

import { StickyNote } from 'lucide-react'
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

interface NoteDialogProps {
  /** Testo della Nota. `null` o vuoto = niente icona: non c'è nulla da aprire. */
  notes: string | null
  /** Di chi è la Nota, per l'etichetta accessibile dell'icona. */
  author: string
}

/**
 * Nota (ADR 0019) nel pannello admin: un'icona **presente solo quando la Nota
 * c'è**, che apre il testo intero in una modale.
 *
 * Non è una colonna con il testo dentro: mille caratteri per riga renderebbero
 * illeggibile la tabella proprio per le Prenotazioni senza Nota, che sono la
 * maggioranza. Così la colonna resta stretta e vuota fin quando qualcuno non
 * ha scritto qualcosa.
 *
 * `whitespace-pre-wrap`: gli a-capo scritti nella textarea sono l'unica
 * formattazione che la Nota ha, e buttarli via qui vorrebbe dire leggere un
 * elenco come un paragrafo unico.
 */
export function NoteDialog({ notes, author }: NoteDialogProps) {
  const text = notes?.trim()
  if (!text) return null

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Leggi la nota di ${author}`}
            title={`Leggi la nota di ${author}`}
          />
        }
      >
        <StickyNote className="h-4 w-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nota</DialogTitle>
          <DialogDescription>Scritta da {author} al momento della risposta.</DialogDescription>
        </DialogHeader>
        <p className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm text-pretty">
          {text}
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Chiudi</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
