import { randomBytes } from 'crypto'
import QRCode from 'qrcode'

/** Genera un data URL PNG con il QR code del codice fornito. */
export async function generateQrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(code, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#1f3a8a', light: '#ffffff' },
  })
}

/** Genera un codice ticket univoco e leggibile (1 per Persona). */
export function generateTicketCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  return `TCK-${time}-${random}`
}

/**
 * Genera un token opaco e non indovinabile per il link pubblico di scansione
 * (/scan/[token]). Usa byte casuali crittografici codificati in hex.
 */
export function generateScanToken(): string {
  return randomBytes(24).toString('hex')
}
