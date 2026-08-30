'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, Code2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseAllowedOrigins } from '@/lib/embed'
import { messageFromError } from '@/lib/errors'

interface EmbedCardProps {
  eventId: string
  embedEnabled: boolean
  allowedOrigins: string[]
}

export function EmbedCard({ eventId, embedEnabled, allowedOrigins }: EmbedCardProps) {
  const setEmbedSettings = useMutation(api.events.setEmbedSettings)
  const [enabled, setEnabled] = useState(embedEnabled)
  const [originsText, setOriginsText] = useState(allowedOrigins.join('\n'))
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const { valid, invalid } = useMemo(() => parseAllowedOrigins(originsText), [originsText])

  const snippet = useMemo(() => {
    if (!origin) return ''
    return `<script src="${origin}/embed.js" data-event-id="${eventId}" async></script>`
  }, [origin, eventId])

  async function handleSave() {
    if (invalid.length > 0) {
      toast.error(`Origini non valide: ${invalid.join(', ')}`)
      return
    }
    if (enabled && valid.length === 0) {
      toast.error('Aggiungi almeno un dominio autorizzato per abilitare l\u2019incorporamento')
      return
    }
    setSaving(true)
    try {
      const result = await setEmbedSettings({
        eventId: eventId as Id<'events'>,
        embedEnabled: enabled,
        allowedOrigins: valid,
      })
      setOriginsText(result.allowedOrigins.join('\n'))
      toast.success('Impostazioni di incorporamento salvate')
    } catch (error) {
      toast.error(messageFromError(error, 'Salvataggio non riuscito'))
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copia non riuscita')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Incorporamento del form</CardTitle>
          <Badge variant={embedEnabled ? 'secondary' : 'outline'}>
            {embedEnabled ? 'Abilitato' : 'Disabilitato'}
          </Badge>
        </div>
        <CardDescription>
          Incorpora il form di registrazione su un sito terzo tramite iframe. Solo i domini
          autorizzati potranno mostrarlo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Label className="flex items-start gap-3">
          <Checkbox
            checked={enabled}
            onCheckedChange={(value) => setEnabled(value === true)}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Abilita incorporamento</span>
            <span className="text-sm text-muted-foreground">
              Consente al form di essere mostrato dentro un iframe sui domini indicati.
            </span>
          </span>
        </Label>

        <div className="grid gap-2">
          <Label htmlFor="allowed-origins">Domini autorizzati</Label>
          <Textarea
            id="allowed-origins"
            value={originsText}
            onChange={(e) => setOriginsText(e.target.value)}
            placeholder={'https://www.partner.com\nhttps://*.partner.com'}
            className="font-mono text-xs"
            rows={4}
            aria-invalid={invalid.length > 0}
          />
          <p className="text-sm text-muted-foreground">
            Un&apos;origine per riga. Formato: <code className="font-mono">https://sito.com</code> oppure
            wildcard di sottodominio <code className="font-mono">https://*.sito.com</code>.
          </p>
          {invalid.length > 0 && (
            <p className="text-sm text-destructive">
              Origini non valide: {invalid.join(', ')}
            </p>
          )}
        </div>

        <div>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva impostazioni'}
          </Button>
        </div>

        {embedEnabled && allowedOrigins.length > 0 && (
          <div className="grid gap-2 border-t border-border pt-4">
            <Label htmlFor="embed-snippet" className="flex items-center gap-2">
              <Code2 className="h-4 w-4" aria-hidden="true" />
              Codice da incorporare
            </Label>
            <div className="flex gap-2">
              <Textarea
                id="embed-snippet"
                value={snippet}
                readOnly
                rows={2}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label="Copia codice"
              >
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Incolla questo snippet nel sito di destinazione. L&apos;iframe si adatta
              automaticamente all&apos;altezza del contenuto.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
