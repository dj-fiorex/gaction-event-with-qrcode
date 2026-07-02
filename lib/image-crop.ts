/**
 * Ritaglio + downscale client-side dell'immagine dell'Evento.
 * Produce un blob 16:9 ridimensionato, pronto per l'upload su Convex storage.
 */

/** Area di ritaglio in pixel sorgente, come restituita da react-easy-crop. */
export interface PixelCropArea {
  x: number
  y: number
  width: number
  height: number
}

export interface CroppedImageOptions {
  /** Larghezza massima dell'output; l'immagine viene ridotta se più grande. */
  maxWidth?: number
  /** MIME preferito; fallback automatico a JPEG se non supportato. */
  mimeType?: string
  /** Qualità di codifica (0-1) per formati lossy. */
  quality?: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', () => reject(new Error('Immagine non valida')))
    img.src = src
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality))
}

/**
 * Ritaglia `imageSrc` sull'area indicata, ridimensiona a `maxWidth` mantenendo
 * il rapporto, e codifica in WebP (con fallback JPEG). Ritorna il blob.
 */
export async function createCroppedImageBlob(
  imageSrc: string,
  crop: PixelCropArea,
  options: CroppedImageOptions = {},
): Promise<Blob> {
  const { maxWidth = 1600, mimeType = 'image/webp', quality = 0.85 } = options

  if (crop.width <= 0 || crop.height <= 0) {
    throw new Error('Area di ritaglio non valida')
  }

  const image = await loadImage(imageSrc)

  const scale = crop.width > maxWidth ? maxWidth / crop.width : 1
  const outWidth = Math.max(1, Math.round(crop.width * scale))
  const outHeight = Math.max(1, Math.round(crop.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas non supportato dal browser')

  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outWidth,
    outHeight,
  )

  let blob = await canvasToBlob(canvas, mimeType, quality)
  if (!blob && mimeType !== 'image/jpeg') {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  }
  if (!blob) throw new Error('Impossibile elaborare l\u2019immagine')
  return blob
}
