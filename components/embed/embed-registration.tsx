'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { RegistrationForm } from '@/components/registration-form'
import { Skeleton } from '@/components/ui/skeleton'

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

  return (
    <div ref={containerRef} className="p-4">
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
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-balance">{event.title}</h1>
            <p className="text-sm text-muted-foreground">{event.location}</p>
          </div>
          <RegistrationForm event={event} embed />
        </div>
      )}
    </div>
  )
}

function EmbedMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
