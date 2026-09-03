'use client'

import type { Ref } from 'react'
import { OctagonXIcon } from 'lucide-react'
import { LinkedText } from './linked-text'
import { cn } from '@/lib/utils'

/**
 * Messaggio d'errore reso **dentro il form**, accanto al controllo che lo
 * riguarda (ADR 0021).
 *
 * Sostituisce il toast su ogni superficie pubblica, non solo
 * nell'[[Incorporamento]]: dentro l'iframe un toast è `position: fixed`
 * rispetto al viewport dell'iframe, e siccome l'iframe è alto quanto tutto il
 * contenuto, «in cima al viewport» vuol dire in cima al form — a scorrere è la
 * pagina ospitante, quindi il messaggio non raggiunge mai lo sguardo di chi sta
 * sul bottone. Fuori dall'iframe il toast funzionava, ma svaniva da solo: un
 * errore che sparisce è un errore che si può perdere comunque.
 *
 * `urgent` distingue i due momenti: `role="alert"` interrompe, ed è giusto per
 * un invio appena fallito; `role="status"` attende una pausa, ed è giusto per
 * un avviso che compare mentre l'utente sta ancora compilando.
 */
export function FormAlert({
  message,
  id,
  ref,
  urgent = false,
  className,
}: {
  /** `null` = niente da dire, e il blocco non occupa spazio. */
  message: string | null
  id?: string
  ref?: Ref<HTMLDivElement>
  urgent?: boolean
  className?: string
}) {
  if (!message) return null
  return (
    <div
      id={id}
      ref={ref}
      role={urgent ? 'alert' : 'status'}
      // Focalizzabile da codice ma non col tab: dopo un invio rifiutato il
      // fuoco ci si sposta sopra, così chi naviga da tastiera o con uno screen
      // reader riparte dal motivo e non dal bottone che non ha funzionato.
      tabIndex={-1}
      className={cn(
        'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive outline-none',
        className,
      )}
    >
      <OctagonXIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {/* I messaggi che nominano l'[[E-mail dell'organizzatore]] (ADR 0023)
          arrivano qui come stringa: renderla cliccabile è l'unico modo perché
          «scrivi a info@…» dentro un riquadro d'errore, su un telefono, non
          finisca trascritto a mano. */}
      <p className="text-pretty">
        <LinkedText text={message} />
      </p>
    </div>
  )
}
