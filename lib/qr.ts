import QRCode from 'qrcode'

/** Genera un data URL PNG con il QR code del codice ticket fornito. */
export async function generateQrDataUrl(ticketCode: string): Promise<string> {
  return QRCode.toDataURL(ticketCode, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#1f3a8a', light: '#ffffff' },
  })
}

/** Genera un codice ticket univoco e leggibile. */
export function generateTicketCode(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  return `TCK-${time}-${random}`
}
