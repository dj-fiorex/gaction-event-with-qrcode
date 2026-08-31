'use client'

import { useEffect, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  Layers,
  UserCheck,
  Users,
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateTime, formatTimeRange } from '@/lib/format'
import { CATEGORY_LABEL } from '@/lib/person-labels'
import type { ActivityWithPeople, SlotWithPeople } from '@/lib/types'

interface EventActivityMonitorProps {
  activities: ActivityWithPeople[]
}

type SlotPhase = 'past' | 'current' | 'upcoming'

function slotPhase(slot: SlotWithPeople, now: number): SlotPhase {
  const start = new Date(slot.start).getTime()
  const end = new Date(slot.end).getTime()
  if (now >= end) return 'past'
  if (now >= start && now < end) return 'current'
  return 'upcoming'
}

function activityPersons(activity: ActivityWithPeople): number {
  return activity.slots.reduce((sum, slot) => sum + slot.taken, 0)
}

function SlotPeopleList({ slot }: { slot: SlotWithPeople }) {
  if (slot.persons.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground">
        Nessuna persona prenotata in questo slot.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {slot.persons.map((person) => (
        <li
          key={person.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
        >
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="font-medium">{person.name}</span>
              <Badge variant="outline">{CATEGORY_LABEL[person.category]}</Badge>
            </span>
            {/* Allergie e intolleranze (issue #37): dettaglio per Persona. */}
            {person.allergies && (
              <span className="text-muted-foreground">Allergie: {person.allergies}</span>
            )}
          </span>
          {person.checkedIn ? (
            <span className="flex items-center gap-1.5 text-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium">Dentro</span>
              {person.checkInCount > 1 && (
                <Badge variant="secondary" className="font-normal">
                  x{person.checkInCount}
                </Badge>
              )}
              {person.checkedInAt && (
                <span className="text-muted-foreground">
                  · {formatDateTime(person.checkedInAt)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">In attesa di check-in</span>
          )}
        </li>
      ))}
    </ul>
  )
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
        // Un'Attività ad accesso libero non ha tetto (ADR 0011): il monitor
        // mostra i presenti e basta, invece di dividerli per uno zero.
        const capacity = activity.slots.reduce((sum, s) => sum + (s.capacity ?? 0), 0)
        const insideCount = activity.slots.reduce((sum, s) => sum + s.checkedInCount, 0)
        const currentSlot =
          now === null ? null : activity.slots.find((s) => slotPhase(s, now) === 'current') ?? null
        const currentIndex = currentSlot
          ? activity.slots.findIndex((s) => s.id === currentSlot.id)
          : -1

        return (
          <Card key={activity.id} className="px-4">
            <Accordion>
              <AccordionItem value={activity.id} className="border-b-0">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex flex-1 flex-col gap-2 pr-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-base font-semibold">{activity.title}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {activity.freeAccess ? persons : `${persons}/${capacity}`}
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {insideCount} dentro
                        </Badge>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-normal text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatTimeRange(activity.start, activity.end)}
                      </span>
                      {activity.freeAccess ? (
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                          Accesso libero, senza fasce né posti
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            Slot da {activity.slotDurationMinutes} min
                          </span>
                          <span className="flex items-center gap-1">
                            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                            {activity.slots.length} slot
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent>
                  <div className="flex flex-col gap-3">
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
                          <Badge>{currentSlot.checkedInCount} dentro</Badge>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Nessuno slot in corso in questo momento.
                        </span>
                      )}
                    </div>

                    <Accordion>
                      {activity.slots.map((slot, index) => {
                        const phase = now === null ? 'upcoming' : slotPhase(slot, now)
                        const isCurrent = phase === 'current'
                        return (
                          <AccordionItem
                            key={slot.id}
                            value={slot.id}
                            className="rounded-md border not-last:border-b"
                          >
                            <AccordionTrigger className="px-3 py-2.5 hover:no-underline">
                              <span className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-3">
                                <span className="flex items-center gap-2 font-medium">
                                  {isCurrent && (
                                    <CircleDot
                                      className="h-4 w-4 text-primary"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>Slot {index + 1}</span>
                                  <span className="font-normal text-muted-foreground">
                                    {formatTimeRange(slot.start, slot.end)}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2 font-normal">
                                  {phase === 'past' && <Badge variant="outline">Concluso</Badge>}
                                  {isCurrent && <Badge>In corso</Badge>}
                                  <span className="tabular-nums text-muted-foreground">
                                    {slot.checkedInCount}/{slot.taken} dentro · {slot.available}{' '}
                                    liberi
                                  </span>
                                </span>
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="px-3">
                              <SlotPeopleList slot={slot} />
                            </AccordionContent>
                          </AccordionItem>
                        )
                      })}
                    </Accordion>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Card>
        )
      })}
    </div>
  )
}
