'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { downloadRegistrationsXlsx } from '@/lib/export'
import type { Decline, EventWithStats, Registration } from '@/lib/types'

interface ExportButtonProps {
  registrations: Registration[]
  events: EventWithStats[]
  eventId?: string
  declines?: Decline[]
  disabled?: boolean
}

export function ExportButton({
  registrations,
  events,
  eventId,
  declines = [],
  disabled,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  function handleExport() {
    setLoading(true)
    try {
      const scoped = eventId
        ? registrations.filter((r) => r.eventId === eventId)
        : registrations
      if (scoped.length === 0) {
        toast.error('Nessuna registrazione da esportare')
        return
      }
      downloadRegistrationsXlsx(registrations, events, eventId, declines)
      toast.success('Esportazione completata')
    } catch {
      toast.error('Errore durante l\u2019esportazione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={disabled || loading}>
      <Download className="h-4 w-4" aria-hidden="true" />
      {loading ? 'Esportazione…' : 'Esporta Excel'}
    </Button>
  )
}
