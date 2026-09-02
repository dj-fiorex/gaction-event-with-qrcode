'use client'

import { useState, type ChangeEvent } from 'react'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { FileSpreadsheet, Send, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { messageFromError } from '@/lib/errors'
import {
  MissingColumnsError,
  parseResponses,
  readResponsesFile,
  type ImportedResponse,
  type UnreadableRow,
} from '@/lib/import-responses'
import type { Registration } from '@/lib/types'

interface ImportResponsesCardProps {
  eventId: string
  /** Le Prenotazioni dell'Evento: quelle senza Consegna sono il conteggio del tasto. */
  registrations: Registration[]
}

/** Righe per chiamata: un file grande diventa più transazioni, non una sola. */
const CHUNK_SIZE = 100

type ImportReport = FunctionReturnType<typeof api.registrations.importResponses>
type SkippedRow = ImportReport['skipped'][number]

interface Preview {
  fileName: string
  responses: ImportedResponse[]
  unreadable: UnreadableRow[]
}

/**
 * Import delle risposte e Invio massivo dell'email di conferma (ADR 0020).
 *
 * Il file si legge nel browser; al server arrivano righe già capite, e le
 * regole dell'Evento le applica la mutation riga per riga. L'import non manda
 * email: il tasto sotto conta le Prenotazioni senza Consegna — per costruzione
 * quelle importate e mai spedite — e chiede conferma prima di partire.
 */
export function ImportResponsesCard({ eventId, registrations }: ImportResponsesCardProps) {
  const importResponses = useMutation(api.registrations.importResponses)
  const sendPending = useMutation(api.registrations.sendPendingConfirmations)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [importing, setImporting] = useState(false)
  const [sending, setSending] = useState(false)

  const pendingCount = registrations.filter((r) => r.emailDelivery === null).length

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPreview(null)
    setReport(null)
    if (!file) return
    try {
      const rows = await readResponsesFile(file)
      const parsed = parseResponses(rows)
      if (parsed.responses.length === 0 && parsed.unreadable.length === 0) {
        toast.error('Il file non contiene righe')
        return
      }
      setPreview({ fileName: file.name, ...parsed })
    } catch (error) {
      toast.error(
        error instanceof MissingColumnsError ? error.message : 'File non leggibile',
      )
    }
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    const total: ImportReport = { imported: 0, declined: 0, skipped: [] }
    try {
      for (let i = 0; i < preview.responses.length; i += CHUNK_SIZE) {
        const chunk = preview.responses.slice(i, i + CHUNK_SIZE)
        const partial = await importResponses({
          eventId: eventId as Id<'events'>,
          responses: chunk,
        })
        total.imported += partial.imported
        total.declined += partial.declined
        total.skipped.push(...partial.skipped)
      }
      setReport(total)
      setPreview(null)
      toast.success(
        `Import completato: ${total.imported} prenotazioni, ${total.declined} rinunce, ${total.skipped.length} righe saltate`,
      )
    } catch (error) {
      // Un chunk fallito per intero non ha scritto nulla: le righe dei chunk
      // precedenti sono dentro, e un secondo import aggiunge solo ciò che manca.
      setReport(total)
      toast.error(messageFromError(error, 'Import interrotto: ricarica il file per completarlo'))
    } finally {
      setImporting(false)
    }
  }

  async function handleSend() {
    if (
      !window.confirm(
        `Inviare l'email di conferma con i biglietti a ${pendingCount} prenotazioni senza alcuna consegna registrata?`,
      )
    ) {
      return
    }
    setSending(true)
    try {
      const { sent } = await sendPending({ eventId: eventId as Id<'events'> })
      toast.success(`${sent} email in coda: l’esito compare riga per riga nella tabella`)
    } catch (error) {
      toast.error(messageFromError(error, 'Invio non riuscito'))
    } finally {
      setSending(false)
    }
  }

  const yesCount = preview?.responses.filter((r) => r.participates).length ?? 0
  const noCount = preview ? preview.responses.length - yesCount : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import delle risposte</CardTitle>
        <CardDescription>
          Carica il file Excel esportato dal modulo esterno: ogni «sì» diventa una
          prenotazione, ogni «no» una rinuncia. Le email partono solo con il tasto in
          fondo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="responses-file">File di risposte (.xlsx)</Label>
          <Input
            id="responses-file"
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            disabled={importing}
          />
        </div>

        {preview && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium">{preview.fileName}</span>
              <span className="text-muted-foreground">
                {yesCount} sì, {noCount} no, {preview.unreadable.length} righe non leggibili
              </span>
            </p>
            {preview.unreadable.length > 0 && (
              <SkippedList title="Righe non leggibili" rows={preview.unreadable} />
            )}
            <Button
              onClick={handleImport}
              disabled={importing || preview.responses.length === 0}
              className="w-fit"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {importing ? 'Import in corso…' : `Importa ${preview.responses.length} risposte`}
            </Button>
          </div>
        )}

        {report && (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <p className="text-sm">
              <span className="font-medium">{report.imported}</span> prenotazioni,{' '}
              <span className="font-medium">{report.declined}</span> rinunce,{' '}
              <span className="font-medium">{report.skipped.length}</span> righe saltate.
            </p>
            {report.skipped.length > 0 && (
              <SkippedList title="Righe saltate" rows={report.skipped} />
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {pendingCount === 0
              ? 'Ogni prenotazione ha una consegna dell’email di conferma registrata.'
              : `${pendingCount} prenotazioni senza alcuna consegna registrata: importate e mai spedite, o anteriori al tracciamento delle consegne.`}
          </p>
          <Button onClick={handleSend} disabled={sending || pendingCount === 0} variant="outline">
            <Send className="h-4 w-4" aria-hidden="true" />
            {sending ? 'Invio in corso…' : `Invia email di conferma (${pendingCount})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SkippedList({ title, rows }: { title: string; rows: SkippedRow[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="max-h-48 overflow-y-auto text-sm text-muted-foreground">
        {rows.map((r) => (
          <li key={r.row}>
            Riga {r.row}
            {r.name ? ` (${r.name})` : ''}: {r.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}
