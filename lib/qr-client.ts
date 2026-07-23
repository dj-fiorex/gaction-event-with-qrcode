import QRCode from 'qrcode'
import type { RegisteredPerson } from '@/lib/types'

/** Genera un data URL PNG con il QR code del codice fornito (browser-safe). */
export async function generateQrDataUrl(code: string): Promise<string> {
  return QRCode.toDataURL(code, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#1f3a8a', light: '#ffffff' },
  })
}

interface PersonLike {
  name: string
  category: RegisteredPerson['category']
  age: number | null
  /** Allergie e intolleranze dichiarate. null = nessuna dichiarazione. */
  allergies: string | null
  ticketCode: string
}

/** Arricchisce un elenco di Persone con il QR data URL, generato nel browser. */
export function toRegisteredPersons(persons: PersonLike[]): Promise<RegisteredPerson[]> {
  return Promise.all(
    persons.map(async (p) => ({
      name: p.name,
      category: p.category,
      age: p.age,
      allergies: p.allergies,
      ticketCode: p.ticketCode,
      qrDataUrl: await generateQrDataUrl(p.ticketCode),
    })),
  )
}
