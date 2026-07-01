'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { exportRegistrationsXlsx } from '@/lib/export'

interface ExportButtonProps {
  eventId?: string
  disabled?: boolean
}

function base64ToBlob(base64: string): Blob {
  const bytes = atob(base64)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i)
  }
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function ExportButton({ eventId, disabled }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const result = await exportRegistrationsXlsx(eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const url = URL.createObjectURL(base64ToBlob(result.data.base64))
      const link = document.createElement('a')
      link.href = url
      link.download = result.data.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Esportazione completata')
    } catch {
      toast.error('Errore durante l\u2019esportazione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || loading}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {loading ? 'Esportazione…' : 'Esporta Excel'}
    </Button>
  )
}
