'use client'

import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface TicketResultProps {
  ticketCode: string
  qrDataUrl: string
  emailSimulated: boolean
  onReset: () => void
}

export function TicketResult({
  ticketCode,
  qrDataUrl,
  emailSimulated,
  onReset,
}: TicketResultProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-semibold">Registrazione confermata</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {emailSimulated
              ? 'Il ticket è stato generato. L\u2019invio email è simulato in questo ambiente: mostra il QR qui sotto all\u2019ingresso.'
              : 'Abbiamo inviato il ticket con il QR code alla tua email.'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <Image
            src={qrDataUrl || '/placeholder.svg'}
            alt="QR code del ticket"
            width={220}
            height={220}
            className="h-[220px] w-[220px]"
            unoptimized
          />
        </div>
        <p className="font-mono text-sm tracking-widest">{ticketCode}</p>
        <Button variant="outline" onClick={onReset}>
          Nuova registrazione
        </Button>
      </CardContent>
    </Card>
  )
}
