'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { ImagePlus, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createCroppedImageBlob } from '@/lib/image-crop'

const ASPECT = 16 / 9
const OUTPUT_MIME = 'image/webp'

interface EventImageFieldProps {
  /** storageId corrente selezionato nel form (undefined = nessuna immagine). */
  value: string | undefined
  /** URL dell'immagine già salvata (modalità modifica), usato per l'anteprima. */
  initialImageUrl?: string | null
  onChange: (storageId: string | undefined) => void
  disabled?: boolean
}

export function EventImageField({
  value,
  initialImageUrl,
  onChange,
  disabled,
}: EventImageFieldProps) {
  const generateUploadUrl = useMutation(api.events.generateUploadUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rawSrc, setRawSrc] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(initialImageUrl ?? null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPixels, setAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    return () => {
      if (rawSrc) URL.revokeObjectURL(rawSrc)
    }
  }, [rawSrc])

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const onCropComplete = useCallback((_area: Area, areaInPixels: Area) => {
    setAreaPixels(areaInPixels)
  }, [])

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Seleziona un file immagine')
      return
    }
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setAreaPixels(null)
    setRawSrc(URL.createObjectURL(file))
  }

  function cancelCrop() {
    if (rawSrc) URL.revokeObjectURL(rawSrc)
    setRawSrc(null)
    setAreaPixels(null)
  }

  async function confirmCrop() {
    if (!rawSrc || !areaPixels) return
    setUploading(true)
    try {
      const blob = await createCroppedImageBlob(rawSrc, areaPixels, {
        maxWidth: 1600,
        mimeType: OUTPUT_MIME,
        quality: 0.85,
      })

      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      })
      if (!response.ok) throw new Error('Upload non riuscito')
      const { storageId } = (await response.json()) as { storageId: string }

      if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(blob))
      onChange(storageId)

      URL.revokeObjectURL(rawSrc)
      setRawSrc(null)
      setAreaPixels(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore durante il caricamento')
    } finally {
      setUploading(false)
    }
  }

  function removeImage() {
    if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    setPreview(null)
    onChange(undefined)
  }

  const hasImage = value !== undefined || Boolean(preview)

  return (
    <div className="grid gap-2">
      <Label>Immagine di copertina</Label>
      <p className="text-sm text-muted-foreground">
        Formato 16:9. L&apos;immagine viene ritagliata e ottimizzata prima del caricamento.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileSelect}
        disabled={disabled || uploading}
      />

      {rawSrc ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-muted">
            <Cropper
              image={rawSrc}
              crop={crop}
              zoom={zoom}
              aspect={ASPECT}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="event-image-zoom" className="text-sm font-normal">
              Zoom
            </Label>
            <input
              id="event-image-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
              aria-label="Zoom dell'immagine"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={confirmCrop} disabled={uploading || !areaPixels}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {uploading ? 'Caricamento…' : 'Conferma ritaglio'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={cancelCrop}
              disabled={uploading}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {preview ? (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview || '/placeholder.svg'}
                alt="Anteprima immagine dell'evento"
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <ImagePlus className="h-8 w-8" aria-hidden="true" />
              <span className="text-sm">Carica un&apos;immagine</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {hasImage ? 'Cambia immagine' : 'Scegli immagine'}
            </Button>
            {hasImage && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={removeImage}
                disabled={disabled || uploading}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Rimuovi
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
