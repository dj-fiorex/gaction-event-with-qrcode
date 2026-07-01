'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, CircleDot, Clock, Layers, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatTimeRange } from '@/lib/format'
import type { ActivityWithAvailability, SlotWithAvailability } from '@/lib/types'

interface EventActivityMonitorProps {
  activities: ActivityWithAvailability[]
}

type SlotPhase = 'past' | 'current' | 'upcoming'

function slotPhase(slot: SlotWithAvailability, now: number): SlotPhase {
  const start = new Date(slot.start).getTime()
  const end = new Date(slot.end).getTime()
  if (now >= end) return 'past'
  if (now >= start && now < end) return 'current'
  return 'upcoming'
}

function activityPersons(activity: ActivityWithAvailability): number {
  return activity.slots.reduce((sum, slot) => sum + slot.taken, 0)
}

export function EventActivityMonitor({ activities }: EventActivityMonitorProps) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (activities.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nessuna attività configurata per questo evento.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {activities.map((activity) => {
        const persons = activityPersons(activity)
        const capacity = activity.slots.reduce((sum, s) => sum + s.capacity, 0)
        const currentSlot =
          now === null ? null : activity.slots.find((s) => slotPhase(s, now) === 'current') ?? null
        const currentIndex = currentSlot
          ? activity.slots.findIndex((s) => s.id === currentSlot.id)
          : -1

        return (
          <Card key={activity.id}>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base">{activity.title}</CardTitle>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatTimeRange(activity.start, activity.end)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      Slot da {activity.slotDurationMinutes} min
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                      {activity.slots.length} slot
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  {persons}/{capacity} persone
                </Badge>
              </div>

              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {now === null ? (
                  <span className="text-muted-foreground">Calcolo dello slot corrente…</span>
                ) : currentSlot ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span className="font-medium">
                      Slot corrente {currentIndex + 1} di {activity.slots.length}
                    </span>
                    <span className="text-muted-foreground">
                      {formatTimeRange(currentSlot.start, currentSlot.end)}
                    </span>
                    <Badge variant="outline">{currentSlot.taken} presenti</Badge>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Nessuno slot in corso in questo momento.
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent>
              <ul className="flex flex-col gap-2">
                {activity.slots.map((slot, index) => {
                  const phase = now === null ? 'upcoming' : slotPhase(slot, now)
                  const isCurrent = phase === 'current'
                  return (
                    <li
                      key={slot.id}
                      className={[
                        'flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm',
                        isCurrent ? 'border-primary bg-primary/5' : '',
                        phase === 'past' ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {isCurrent && (
                          <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />
                        )}
                        <span>Slot {index + 1}</span>
                        <span className="font-normal text-muted-foreground">
                          {formatTimeRange(slot.start, slot.end)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {phase === 'past' && <Badge variant="outline">Concluso</Badge>}
                        {isCurrent && <Badge>In corso</Badge>}
                        <span className="tabular-nums text-muted-foreground">
                          {slot.taken}/{slot.capacity} · {slot.available} liberi
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
