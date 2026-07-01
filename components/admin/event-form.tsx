'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { createEvent } from '@/lib/actions'

interface EventFormState {
  title: string
  description: string
  date: string
  location: string
  capacity: string
  allowChildren: boolean
  maxChildrenPerRegistration: string
}

const emptyState: EventFormState = {
  title: '',
  description: '',
  date: '',
  location: '',
  capacity: '50',
  allowChildren: false,
  maxChildrenPerRegistration: '2',
}

export function EventForm() {
  const router = useRouter()
  const [state, setState] = useState<EventFormState>(emptyState)
  const [submitting, setSubmitting] = useState(false)

  function update<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await createEvent({
        title: state.title,
        description: state.description,
        date: state.date,
        location: state.location,
        capacity: Number(state.capacity),
        allowChildren: state.allowChildren,
        maxChildrenPerRegistration: Number(state.maxChildrenPerRegistration),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Evento creato')
      setState(emptyState)
      router.refresh()
    } catch {
      toast.error('Errore durante la creazione')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="title">Titolo</Label>
        <Input
          id="title"
          value={state.title}
          onChange={(e) => update('title', e.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Descrizione</Label>
        <Textarea
          id="description"
          rows={3}
          value={state.description}
          onChange={(e) => update('description', e.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="date">Data e ora</Label>
          <Input
            id="date"
            type="datetime-local"
            value={state.date}
            onChange={(e) => update('date', e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location">Luogo</Label>
          <Input
            id="location"
            value={state.location}
            onChange={(e) => update('location', e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid gap-2 sm:max-w-40">
        <Label htmlFor="capacity">Capienza</Label>
        <Input
          id="capacity"
          type="number"
          min={1}
          value={state.capacity}
          onChange={(e) => update('capacity', e.target.value)}
          required
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="allowChildren"
          checked={state.allowChildren}
          onCheckedChange={(checked) => update('allowChildren', checked === true)}
        />
        <Label htmlFor="allowChildren" className="font-normal">
          Consenti registrazione di bambini associati
        </Label>
      </div>
      {state.allowChildren && (
        <div className="grid gap-2 sm:max-w-60">
          <Label htmlFor="maxChildren">Max bambini per registrazione</Label>
          <Input
            id="maxChildren"
            type="number"
            min={0}
            value={state.maxChildrenPerRegistration}
            onChange={(e) => update('maxChildrenPerRegistration', e.target.value)}
          />
        </div>
      )}
      <div>
        <Button type="submit" disabled={submitting}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {submitting ? 'Creazione…' : 'Crea evento'}
        </Button>
      </div>
    </form>
  )
}
