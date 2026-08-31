'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { RegistrationForm } from '@/components/registration-form'
import { Skeleton } from '@/components/ui/skeleton'
import { embedThemeCssVars, embedThemeFontFamily } from '@/lib/embed'

/** Tipo del messaggio di altezza inviato al documento ospitante. */
export const EMBED_RESIZE_MESSAGE = 'gaction:embed-height' as const

interface EmbedRegistrationProps {
  eventId: string
}

/**
 * Rende il form di registrazione dentro l'iframe di incorporamento e comunica
 * l'altezza del contenuto al documento ospitante tramite postMessage, così che
 * lo script loader possa ridimensionare l'iframe (nessuna scrollbar interna).
 */
export function EmbedRegistration({ eventId }: EmbedRegistrationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const event = useQuery(api.events.getPublic, { eventId: eventId as Id<'events'> })

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const postHeight = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      window.parent.postMessage({ type: EMBED_RESIZE_MESSAGE, eventId, height }, '*')
    }

    postHeight()
    const observer = new ResizeObserver(postHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [eventId, event])

  // Aspetto dell'Incorporamento (ADR 0013). Assente = nessuna sovrascrittura:
  // il form resta *esattamente* il tema di `globals.css`, con i suoi `oklch`.
  // Riapplicare qui il default convertito in esadecimale sarebbe quasi uguale
  // ma non uguale — perderebbe la punta di blu che il tema ha nei bordi e nel
  // testo attenuato — e «assente = comportamento odierno» smetterebbe di
  // essere vero alla lettera.
  const theme = event?.embedTheme ?? null

  // I token vanno su `:root`, non sul contenitore. `body` porta già
  // `bg-background text-foreground`, quindi risolve `var(--background)` e
  // `var(--foreground)` **su di sé**, che sta sopra il contenitore: con le
  // variabili definite più in basso body resterebbe col tema predefinito, e
  // ogni discendente senza una classe di colore propria — i titoli delle
  // sezioni del form, per esempio — erediterebbe quel nero **già calcolato**.
  // Le variabili si ereditano; il valore che un `var()` ha già prodotto no.
  const themeCss = theme
    ? `:root{${Object.entries(embedThemeCssVars(theme))
        .map(([name, value]) => `${name}:${value}`)
        .join(';')};font-size:${theme.textScale}%}`
    : null

  // Il carattere resta inline sul contenitore, e non in quella regola: il
  // valore di `--font-sans` è incorporato da `@theme inline` dentro l'utility
  // `.font-sans`, che quindi non rilegge la variabile, e una regola su `body`
  // perderebbe comunque contro la specificità di una classe.
  const themeStyle: CSSProperties | undefined = theme
    ? { fontFamily: embedThemeFontFamily(theme) }
    : undefined

  return (
    <div ref={containerRef} className="p-4" style={themeStyle}>
      {/* Nella stessa regola anche la scala: le utility `text-*` di Tailwind
          sono in `rem`, quindi solo la dimensione dell'elemento radice le muove
          tutte insieme e in proporzione. Lo sfondo non serve ripeterlo — con
          `--background` ridefinita qui, il `bg-background` del body la legge. */}
      {themeCss && <style>{themeCss}</style>}
      {event === undefined ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : event === null ? (
        <EmbedMessage
          title="Evento non trovato"
          description="Il link di incorporamento non è più valido."
        />
      ) : !event.embedEnabled ? (
        <EmbedMessage
          title="Registrazione non disponibile"
          description="L'incorporamento non è abilitato per questo evento."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Titolo nascosto vuol dire nascosto agli occhi, non all'albero di
              accessibilità: dentro l'iframe l'h1 è l'unica cosa che dice a
              quale Evento ci si iscrive, perché il sito ospitante è un altro
              documento e il <title> della scheda è generico. In `sr-only` è
              fuori flusso, quindi non apre un `gap-6` vuoto sopra il form. */}
          {!event.embedShowTitle && <h1 className="sr-only">{event.title}</h1>}
          {(event.embedShowTitle || event.embedShowLocation) && (
            <div>
              {event.embedShowTitle && (
                <h1 className="text-lg font-semibold tracking-tight text-balance">
                  {event.title}
                </h1>
              )}
              {/* Il luogo non cambia resa quando resta da solo: uno stile
                  condizionale qui varrebbe meno della regressione che rischia
                  sul caso normale. */}
              {event.embedShowLocation && (
                <p className="text-sm text-muted-foreground">{event.location}</p>
              )}
            </div>
          )}
          <RegistrationForm event={event} embed />
        </div>
      )}
    </div>
  )
}

/**
 * Avviso mostrato al posto del form dentro l'iframe. Senza contenitori, come
 * il resto delle superfici pubbliche: nell'embed il confine lo dà già
 * l'iframe, ridimensionato sull'altezza del contenuto.
 */
function EmbedMessage({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
