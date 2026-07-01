'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/types'

type TicketsPdfAction = () => Promise<ActionResult<{ base64: string; filename: string }>>

interface PdfDownloadButtonProps {
  action: TicketsPdfAction
  label: string
  loadingLabel?: string
  successMessage?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  disabled?: boolean
  /** Mostra solo l'icona (con label come aria-label), utile nelle celle di tabella. */
  iconOnly?: boolean
}

function base64ToPdfBlob(base64: string): Blob {
  const bytes = atob(base64)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i)
  }
  return new Blob([buffer], { type: 'application/pdf' })
}

export function PdfDownloadButton({
  action,
  label,
  loadingLabel = 'Generazione…',
  successMessage = 'PDF pronto',
  variant = 'outline',
  size = 'sm',
  disabled,
  iconOnly,
}: PdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const result = await action()
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const url = URL.createObjectURL(base64ToPdfBlob(result.data.base64))
      const link = document.createElement('a')
      link.href = url
      link.download = result.data.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success(successMessage)
    } catch {
      toast.error('Errore durante la generazione del PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={iconOnly ? 'icon' : size}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
    >
      <FileDown className="h-4 w-4" aria-hidden="true" />
      {!iconOnly && (loading ? loadingLabel : label)}
    </Button>
  )
}
