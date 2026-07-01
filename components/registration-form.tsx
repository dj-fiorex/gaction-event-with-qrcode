'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { registerForEvent } from '@/lib/actions'
import { registrationSchema, type RegistrationInput } from '@/lib/schemas'
import { typedZodResolver } from '@/lib/zod-resolver'
import type { EventWithStats } from '@/lib/types'
import { TicketResult } from './ticket-result'

interface TicketData {
  ticketCode: string
  qrDataUrl: string
  emailSimulated: boolean
}

export function RegistrationForm({ event }: { event: EventWithStats }) {
  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<RegistrationInput>({
    resolver: typedZodResolver(registrationSchema),
    defaultValues: {
      eventId: event.id,
      employeeName: '',
      employeeEmail: '',
      department: '',
      children: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'children' })

  const allowChildren = event.childOptions.allowChildren
  const maxChildren = event.childOptions.maxChildrenPerRegistration

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    const result = await registerForEvent(values)
    setSubmitting(false)
    if (result.success) {
      setTicket(result.data)
      toast.success('Registrazione completata')
    } else {
      toast.error(result.error)
    }
  })

  if (ticket) {
    return (
      <TicketResult
        {...ticket}
        onReset={() => {
          reset()
          setTicket(null)
        }}
      />
    )
  }

  if (event.seatsAvailable <= 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          I posti per questo evento sono esauriti.
        </CardContent>
      </Card>
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
            <Label htmlFor="employeeName">Nome e cognome</Label>
            <Input id="employeeName" {...register('employeeName')} aria-invalid={!!errors.employeeName} />
            {errors.employeeName && (
              <p className="text-sm text-destructive">{errors.employeeName.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="employeeEmail">Email aziendale</Label>
            <Input
              id="employeeEmail"
              type="email"
              {...register('employeeEmail')}
              aria-invalid={!!errors.employeeEmail}
            />
            {errors.employeeEmail && (
              <p className="text-sm text-destructive">{errors.employeeEmail.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="department">Reparto</Label>
            <Input id="department" {...register('department')} aria-invalid={!!errors.department} />
            {errors.department && (
              <p className="text-sm text-destructive">{errors.department.message}</p>
            )}
          </div>

          {allowChildren && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Bambini associati</p>
                  <p className="text-sm text-muted-foreground">
                    Fino a {maxChildren} bambini per registrazione.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fields.length >= maxChildren}
                  onClick={() => append({ name: '', age: 0 })}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Aggiungi
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="flex items-start gap-3">
                  <div className="grid flex-1 gap-2">
                    <Label htmlFor={`child-name-${index}`} className="sr-only">
                      Nome bambino
                    </Label>
                    <Input
                      id={`child-name-${index}`}
                      placeholder="Nome"
                      {...register(`children.${index}.name` as const)}
                      aria-invalid={!!errors.children?.[index]?.name}
                    />
                    {errors.children?.[index]?.name && (
                      <p className="text-sm text-destructive">
                        {errors.children[index]?.name?.message}
                      </p>
                    )}
                  </div>
                  <div className="grid w-24 gap-2">
                    <Label htmlFor={`child-age-${index}`} className="sr-only">
                      Età bambino
                    </Label>
                    <Input
                      id={`child-age-${index}`}
                      type="number"
                      min={0}
                      max={17}
                      placeholder="Età"
                      {...register(`children.${index}.age` as const, { valueAsNumber: true })}
                      aria-invalid={!!errors.children?.[index]?.age}
                    />
                    {errors.children?.[index]?.age && (
                      <p className="text-sm text-destructive">
                        {errors.children[index]?.age?.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5"
                    onClick={() => remove(index)}
                    aria-label="Rimuovi bambino"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Registrazione in corso…' : 'Conferma registrazione'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
