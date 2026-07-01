'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface PdfDownloadButtonProps {
  /** Callback che genera e scarica il PDF lato client. */
  onDownload: () => Promise<void>
  label: string
  loadingLabel?: string
  successMessage?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  disabled?: boolean
  /** Mostra solo l'icona (con label come aria-label), utile nelle celle di tabella. */
  iconOnly?: boolean
}

export function PdfDownloadButton({
  onDownload,
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
      await onDownload()
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
