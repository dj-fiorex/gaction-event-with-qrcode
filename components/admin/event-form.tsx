'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createEvent } from '@/lib/actions'
import { eventSchema, type EventInput } from '@/lib/schemas'
import { typedZodResolver } from '@/lib/zod-resolver'

const emptyActivity = {
  title: '',
  start: '',
  end: '',
  slotDurationMinutes: 30,
  capacityPerSlot: 10,
}

const defaultValues: EventInput = {
  title: '',
  description: '',
  location: '',
  activityPolicy: 'free',
  minActivities: 1,
  allowOverlap: false,
  checkInToleranceMinutes: 15,
  allowChildren: false,
  maxChildrenPerRegistration: 2,
  allowCompanions: false,
  maxCompanionsPerRegistration: 1,
  activities: [emptyActivity],
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}

export function EventForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<EventInput>({
    resolver: typedZodResolver(eventSchema),
    defaultValues,
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'activities' })

  const activityPolicy = watch('activityPolicy')
  const allowChildren = watch('allowChildren')
  const allowCompanions = watch('allowCompanions')

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      const result = await createEvent(values)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Evento creato')
      reset(defaultValues)
      router.refresh()
    } catch {
      toast.error('Errore durante la creazione')
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="title">Titolo</Label>
        <Input id="title" {...register('title')} aria-invalid={!!errors.title} />
        <FieldError message={errors.title?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Descrizione</Label>
        <Textarea id="description" rows={3} {...register('description')} aria-invalid={!!errors.description} />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="location">Luogo</Label>
        <Input id="location" {...register('location')} aria-invalid={!!errors.location} />
        <FieldError message={errors.location?.message} />
      </div>

      {/* Attività */}
      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <legend className="font-medium">Attività</legend>
            <p className="text-sm text-muted-foreground">
              Ogni attività genera automaticamente gli slot dalla durata indicata.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => append(emptyActivity)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Aggiungi
          </Button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">Attività {index + 1}</span>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  aria-label={`Rimuovi attività ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`act-title-${index}`}>Nome attività</Label>
              <Input
                id={`act-title-${index}`}
                {...register(`activities.${index}.title` as const)}
                aria-invalid={!!errors.activities?.[index]?.title}
              />
              <FieldError message={errors.activities?.[index]?.title?.message} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`act-start-${index}`}>Inizio</Label>
                <Input
                  id={`act-start-${index}`}
                  type="datetime-local"
                  {...register(`activities.${index}.start` as const)}
                  aria-invalid={!!errors.activities?.[index]?.start}
                />
                <FieldError message={errors.activities?.[index]?.start?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`act-end-${index}`}>Fine</Label>
                <Input
                  id={`act-end-${index}`}
                  type="datetime-local"
                  {...register(`activities.${index}.end` as const)}
                  aria-invalid={!!errors.activities?.[index]?.end}
                />
                <FieldError message={errors.activities?.[index]?.end?.message} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`act-duration-${index}`}>Durata slot (minuti)</Label>
                <Input
                  id={`act-duration-${index}`}
                  type="number"
                  min={5}
                  step={5}
                  {...register(`activities.${index}.slotDurationMinutes` as const, { valueAsNumber: true })}
                  aria-invalid={!!errors.activities?.[index]?.slotDurationMinutes}
                />
                <FieldError message={errors.activities?.[index]?.slotDurationMinutes?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`act-capacity-${index}`}>Posti per slot</Label>
                <Input
                  id={`act-capacity-${index}`}
                  type="number"
                  min={1}
                  {...register(`activities.${index}.capacityPerSlot` as const, { valueAsNumber: true })}
                  aria-invalid={!!errors.activities?.[index]?.capacityPerSlot}
                />
                <FieldError message={errors.activities?.[index]?.capacityPerSlot?.message} />
              </div>
            </div>
          </div>
        ))}
        <FieldError message={errors.activities?.message} />
      </fieldset>

      {/* Regole di selezione */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="activityPolicy">Selezione attività</Label>
          <Controller
            control={control}
            name="activityPolicy"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="activityPolicy" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Libera</SelectItem>
                  <SelectItem value="min">Minimo N attività</SelectItem>
                  <SelectItem value="all">Tutte obbligatorie</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        {activityPolicy === 'min' && (
          <div className="grid gap-2">
            <Label htmlFor="minActivities">Minimo attività</Label>
            <Input
              id="minActivities"
              type="number"
              min={1}
              {...register('minActivities', { valueAsNumber: true })}
              aria-invalid={!!errors.minActivities}
            />
            <FieldError message={errors.minActivities?.message} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="allowOverlap"
            render={({ field }) => (
              <Checkbox
                id="allowOverlap"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <Label htmlFor="allowOverlap" className="font-normal">
            Permetti slot sovrapposti
          </Label>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tolerance">Tolleranza check-in (minuti)</Label>
          <Input
            id="tolerance"
            type="number"
            min={0}
            {...register('checkInToleranceMinutes', { valueAsNumber: true })}
            aria-invalid={!!errors.checkInToleranceMinutes}
          />
          <FieldError message={errors.checkInToleranceMinutes?.message} />
        </div>
      </div>

      {/* Figli e accompagnatori */}
      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="allowChildren"
            render={({ field }) => (
              <Checkbox
                id="allowChildren"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <Label htmlFor="allowChildren" className="font-normal">
            Ammetti figli
          </Label>
        </div>
        {allowChildren && (
          <div className="grid gap-2 sm:max-w-60">
            <Label htmlFor="maxChildren">Max figli per registrazione</Label>
            <Input
              id="maxChildren"
              type="number"
              min={0}
              {...register('maxChildrenPerRegistration', { valueAsNumber: true })}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="allowCompanions"
            render={({ field }) => (
              <Checkbox
                id="allowCompanions"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <Label htmlFor="allowCompanions" className="font-normal">
            Ammetti accompagnatori
          </Label>
        </div>
        {allowCompanions && (
          <div className="grid gap-2 sm:max-w-60">
            <Label htmlFor="maxCompanions">Max accompagnatori per registrazione</Label>
            <Input
              id="maxCompanions"
              type="number"
              min={0}
              {...register('maxCompanionsPerRegistration', { valueAsNumber: true })}
            />
          </div>
        )}
      </div>

      <div>
        <Button type="submit" disabled={submitting}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {submitting ? 'Creazione…' : 'Crea evento'}
        </Button>
      </div>
    </form>
  )
}
