'use client'

import { Repeat } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, formatTime } from '@/lib/format'
import type { CheckInMoment } from '@/lib/person-status'

interface MomentValueProps {
  moment: CheckInMoment
  /**
   * `time` allo scanner, dove l'operatore è dentro la giornata dell'Evento e la
   * data sarebbe rumore; `datetime` nel pannello admin, che si guarda anche a
   * evento finito.
   */
  format: 'time' | 'datetime'
}

/**
 * Un momento di Check-in reso allo stesso modo ovunque compaia (issue #39).
 *
 * Un momento mai registrato resta un trattino, non una riga assente: «non è
 * ancora uscito» è un'informazione, e sparire non la comunica. Quando le
 * registrazioni sono più d'una mostra anche l'ultima, altrimenti dopo un
 * rientro la card direbbe «entrato ore 09:00» a chi è appena passato.
 */
export function MomentValue({ moment, format }: MomentValueProps) {
  if (!moment.at) {
    return (
      <span className="text-muted-foreground" aria-label="non registrato">
        —
      </span>
    )
  }

  const render = format === 'time' ? (iso: string) => `ore ${formatTime(iso)}` : formatDateTime
  const repeated = moment.count > 1
  const first = render(moment.at)
  const last = moment.lastAt ? render(moment.lastAt) : null
  // Confronto sul testo reso, non sugli ISO: due passaggi nello stesso minuto
  // stamperebbero «ore 15:45 → ore 15:45», una freccia che non dice nulla.
  const showLast = repeated && last !== null && last !== first

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-medium tabular-nums">{first}</span>
      {showLast && <span className="text-muted-foreground tabular-nums">→ {last}</span>}
      {repeated && (
        <Badge variant="outline" className="gap-1 px-1.5 py-0 text-xs font-normal">
          <Repeat className="h-3 w-3" aria-hidden="true" />
          {moment.count}×
        </Badge>
      )}
    </span>
  )
}
