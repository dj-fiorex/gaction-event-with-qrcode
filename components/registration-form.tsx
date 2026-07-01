'use client'

import { useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { registrationSchema, type RegistrationInput } from '@/lib/schemas'
import { typedZodResolver } from '@/lib/zod-resolver'
import { formatTimeRange, formatDateRange } from '@/lib/format'
import { generateQrDataUrl } from '@/lib/qr-client'
import { intervalsOverlap } from '@/lib/slots'
import type { EventWithStats, RegisteredPerson, SlotWithAvailability } from '@/lib/types'
import { TicketResult } from './ticket-result'

const NONE = '__none__'

const POLICY_HINT: Record<EventWithStats['activityPolicy'], (min: number) => string> = {
  all: () => 'Devi selezionare uno slot per ogni attività.',
  min: (min) => `Devi selezionare almeno ${min} attività.`,
  free: () => 'Seleziona le attività a cui vuoi partecipare.',
}

export function RegistrationForm({ event }: { event: EventWithStats }) {
  const registerMutation = useMutation(api.registrations.register)
  const sendTickets = useAction(api.emails.sendTickets)
  const [tickets, setTickets] = useState<RegisteredPerson[] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [slotByActivity, setSlotByActivity] = useState<Record<string, string>>({})

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<RegistrationInput>({
    resolver: typedZodResolver(registrationSchema),
    defaultValues: {
      eventId: event.id,
      userName: '',
      contactEmail: '',
      children: [],
      companions: [],
      selections: [],
    },
  })

  const childrenArray = useFieldArray({ control, name: 'children' })
  const companionsArray = useFieldArray({ control, name: 'companions' })

  const personsNeeded = 1 + childrenArray.fields.length + companionsArray.fields.length

  const slotById = useMemo(() => {
    const map = new Map<string, SlotWithAvailability>()
    for (const activity of event.activities) {
      for (const slot of activity.slots) map.set(slot.id, slot)
    }
    return map
  }, [event.activities])

  function setSlot(activityId: string, slotId: string) {
    setSlotByActivity((prev) => ({ ...prev, [activityId]: slotId }))
  }

  function buildSelections() {
    return event.activities
      .map((a) => ({ activityId: a.id, slotId: slotByActivity[a.id] ?? '' }))
      .filter((s) => s.slotId && s.slotId !== NONE)
  }

  function validateSelectionsClient(selections: { activityId: string; slotId: string }[]): string | null {
    if (event.activityPolicy === 'all' && selections.length !== event.activities.length) {
      return 'Devi selezionare uno slot per ogni attività'
    }
    if (event.activityPolicy === 'min' && selections.length < event.minActivities) {
      return `Devi selezionare almeno ${event.minActivities} attività`
    }
    if (event.activityPolicy === 'free' && selections.length === 0) {
      return 'Seleziona almeno un\u2019attività'
    }
    if (!event.allowOverlap) {
      const slots = selections.map((s) => slotById.get(s.slotId)!).filter(Boolean)
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          if (intervalsOverlap(slots[i].start, slots[i].end, slots[j].start, slots[j].end)) {
            return 'Hai selezionato slot che si sovrappongono nel tempo'
          }
        }
      }
    }
    return null
  }

  const onSubmit = handleSubmit(async (values) => {
    const selections = buildSelections()
    const selectionError = validateSelectionsClient(selections)
    if (selectionError) {
      toast.error(selectionError)
      return
    }

    setSubmitting(true)
    try {
      const result = await registerMutation({
        eventId: event.id as Id<'events'>,
        userName: values.userName,
        contactEmail: values.contactEmail,
        children: values.children ?? [],
        companions: values.companions ?? [],
        selections: selections.map((s) => ({
          activityId: s.activityId as Id<'activities'>,
          slotId: s.slotId as Id<'slots'>,
        })),
      })

      const registeredPersons: RegisteredPerson[] = await Promise.all(
        result.persons.map(async (p): Promise<RegisteredPerson> => ({
          name: p.name,
          category: p.category,
          age: p.age,
          ticketCode: p.ticketCode,
          qrDataUrl: await generateQrDataUrl(p.ticketCode),
        })),
      )

      setTickets(registeredPersons)
      toast.success('Registrazione completata')

      void sendTickets({
        eventTitle: result.eventTitle,
        eventLocation: result.eventLocation,
        contactEmail: result.contactEmail,
        persons: registeredPersons,
      }).catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Registrazione non riuscita')
    } finally {
      setSubmitting(false)
    }
  })

  if (tickets) {
    return (
      <TicketResult
        persons={tickets}
        event={{
          title: event.title,
          location: event.location,
          dateRange: formatDateRange(event.startsAt, event.endsAt),
        }}
        onReset={() => {
          reset()
          setSlotByActivity({})
          setTickets(null)
        }}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrati all&apos;evento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <input type="hidden" {...register('eventId')} />

          <div className="grid gap-2">
            <Label htmlFor="userName">Il tuo nome e cognome</Label>
            <Input id="userName" {...register('userName')} aria-invalid={!!errors.userName} />
            {errors.userName && <p className="text-sm text-destructive">{errors.userName.message}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contactEmail">Email</Label>
            <Input
              id="contactEmail"
              type="email"
              {...register('contactEmail')}
              aria-invalid={!!errors.contactEmail}
            />
            {errors.contactEmail && (
              <p className="text-sm text-destructive">{errors.contactEmail.message}</p>
            )}
          </div>

          {event.allowChildren && (
            <PersonRepeater
              title="Figli"
              hint={`Fino a ${event.maxChildrenPerRegistration} figli. Riceveranno un proprio QR.`}
              fields={childrenArray.fields}
              canAdd={childrenArray.fields.length < event.maxChildrenPerRegistration}
              onAdd={() => childrenArray.append({ name: '', age: 0 })}
              onRemove={childrenArray.remove}
              renderExtra={(index) => (
                <div className="grid w-24 gap-2">
                  <Label htmlFor={`child-age-${index}`} className="sr-only">
                    Età
                  </Label>
                  <Input
                    id={`child-age-${index}`}
                    type="number"
                    min={0}
                    max={17}
                    placeholder="Età"
                    {...register(`children.${index}.age` as const, { valueAsNumber: true })}
                  />
                </div>
              )}
              register={(index) => register(`children.${index}.name` as const)}
              namePlaceholder="Nome del figlio"
            />
          )}

          {event.allowCompanions && (
            <PersonRepeater
              title="Accompagnatori"
              hint={`Fino a ${event.maxCompanionsPerRegistration} accompagnatori. Riceveranno un proprio QR.`}
              fields={companionsArray.fields}
              canAdd={companionsArray.fields.length < event.maxCompanionsPerRegistration}
              onAdd={() => companionsArray.append({ name: '' })}
              onRemove={companionsArray.remove}
              register={(index) => register(`companions.${index}.name` as const)}
              namePlaceholder="Nome dell'accompagnatore"
            />
          )}

          {/* Selezione attività / slot */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Attività</p>
              <p className="text-sm text-muted-foreground">
                {POLICY_HINT[event.activityPolicy](event.minActivities)} Lo slot scelto vale per tutte
                le {personsNeeded} persone della prenotazione.
              </p>
            </div>

            {event.activities.map((activity) => {
              const selected = slotByActivity[activity.id] ?? ''
              const items = [
                ...(event.activityPolicy !== 'all'
                  ? [{ value: NONE, label: 'Non partecipo' }]
                  : []),
                ...activity.slots.map((slot) => ({
                  value: slot.id,
                  label: `${formatTimeRange(slot.start, slot.end)} · ${
                    slot.available < personsNeeded ? 'posti insufficienti' : `${slot.available} posti`
                  }`,
                })),
              ]
              return (
                <div key={activity.id} className="grid gap-2">
                  <Label htmlFor={`slot-${activity.id}`}>{activity.title}</Label>
                  <Select
                    items={items}
                    value={selected}
                    onValueChange={(value) => setSlot(activity.id, value ?? '')}
                  >
                    <SelectTrigger id={`slot-${activity.id}`} className="w-full">
                      <SelectValue placeholder="Seleziona una fascia oraria" />
                    </SelectTrigger>
                    <SelectContent>
                      {event.activityPolicy !== 'all' && (
                        <SelectItem value={NONE}>Non partecipo</SelectItem>
                      )}
                      {activity.slots.map((slot) => {
                        const disabled = slot.available < personsNeeded
                        return (
                          <SelectItem key={slot.id} value={slot.id} disabled={disabled}>
                            {formatTimeRange(slot.start, slot.end)} ·{' '}
                            {disabled ? 'posti insufficienti' : `${slot.available} posti`}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Registrazione in corso…' : `Conferma registrazione (${personsNeeded} persone)`}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

interface PersonRepeaterProps {
  title: string
  hint: string
  fields: { id: string }[]
  canAdd: boolean
  onAdd: () => void
  onRemove: (index: number) => void
  register: (index: number) => ReturnType<ReturnType<typeof useForm<RegistrationInput>>['register']>
  namePlaceholder: string
  renderExtra?: (index: number) => React.ReactNode
}

function PersonRepeater({
  title,
  hint,
  fields,
  canAdd,
  onAdd,
  onRemove,
  register,
  namePlaceholder,
  renderExtra,
}: PersonRepeaterProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Aggiungi
        </Button>
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-3">
          <div className="grid flex-1 gap-2">
            <Label htmlFor={`${title}-name-${index}`} className="sr-only">
              {namePlaceholder}
            </Label>
            <Input id={`${title}-name-${index}`} placeholder={namePlaceholder} {...register(index)} />
          </div>
          {renderExtra?.(index)}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5"
            onClick={() => onRemove(index)}
            aria-label="Rimuovi"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  )
}
