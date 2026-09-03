'use client'

import { useCallback, useRef, useState } from 'react'
import { useConvex } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { normalizeEmail } from './email'

export interface EmailResponseCheck {
  /** Lancia il controllo per l'indirizzo dato. Idempotente sullo stesso indirizzo. */
  check: (rawEmail: string) => void
  /** L'indirizzo attualmente nel campo risulta già occupato? */
  isTaken: (rawEmail: string) => boolean
  /** Un controllo è in volo (serve solo dove si attende prima di rendere il form). */
  checking: boolean
  /** true finché nessun controllo è mai stato completato. */
  pristine: boolean
}

/**
 * Anticipo della regola «Una sola risposta per email» (ADR 0005) sul form
 * pubblico: dice all'utente che quell'indirizzo ha già risposto **prima** che
 * compili tutto il resto (ADR 0022).
 *
 * Parte **una volta all'uscita dal campo**, non a ogni tasto: una query per
 * indirizzo completo invece che per battitura. `hasResponse` è pubblica e non
 * autenticata, e legge tutte le Prenotazioni dell'Evento — a ogni tasto
 * sarebbe insieme un'API di enumeration e un moltiplicatore di letture.
 *
 * Ricorda l'indirizzo trovato occupato, non un flag: così basta che l'utente
 * corregga un carattere perché l'avviso sparisca da sé, senza nessun reset da
 * ricordarsi di chiamare nel punto giusto.
 *
 * Non è un controllo: è cortesia. La garanzia resta il rifiuto server-side
 * nelle mutation, che copre anche la corsa fra questa lettura e l'invio.
 */
export function useEmailResponseCheck(eventId: string): EmailResponseCheck {
  const convex = useConvex()
  const [takenEmail, setTakenEmail] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [pristine, setPristine] = useState(true)
  /**
   * L'ultimo indirizzo richiesto. Chi torna dopo che se n'è chiesto un altro
   * ha risposto su una domanda che non è più quella a schermo, e va ignorato:
   * senza questa guardia, blur veloci su due indirizzi diversi possono
   * lasciare a schermo l'esito del primo.
   */
  const latest = useRef('')

  const check = useCallback(
    (rawEmail: string) => {
      const email = normalizeEmail(rawEmail)
      if (email === '') return
      latest.current = email
      setChecking(true)
      void convex
        .query(api.registrations.hasResponse, { eventId: eventId as Id<'events'>, email })
        .then((taken) => {
          if (latest.current !== email) return
          setTakenEmail(taken ? email : null)
          setPristine(false)
        })
        .catch(() => {
          // Una rete che cade non deve chiudere fuori nessuno: l'anticipo tace
          // e si torna al comportamento di sempre, con il rifiuto all'invio.
          if (latest.current !== email) return
          setTakenEmail(null)
          setPristine(false)
        })
        .finally(() => {
          if (latest.current !== email) return
          setChecking(false)
        })
    },
    [convex, eventId],
  )

  const isTaken = useCallback(
    (rawEmail: string) => takenEmail !== null && normalizeEmail(rawEmail) === takenEmail,
    [takenEmail],
  )

  return { check, isTaken, checking, pristine }
}
