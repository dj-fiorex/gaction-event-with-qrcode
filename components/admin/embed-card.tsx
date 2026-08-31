'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useMutation } from 'convex/react'
import { Check, Code2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_EMBED_THEME,
  EMBED_CONTRAST_MIN,
  EMBED_FONT_STACKS,
  EMBED_FONT_STACK_KEYS,
  EMBED_RADIUS_MAX,
  EMBED_TEXT_SCALE_MAX,
  EMBED_TEXT_SCALE_MIN,
  contrastRatio,
  embedThemeCssVars,
  embedThemeFontFamily,
  normalizeHexColor,
  parseAllowedOrigins,
  type EmbedFontStack,
  type EmbedTheme,
} from '@/lib/embed'
import { messageFromError } from '@/lib/errors'

interface EmbedCardProps {
  eventId: string
  embedEnabled: boolean
  allowedOrigins: string[]
  embedShowTitle: boolean
  embedShowLocation: boolean
  embedShowTickets: boolean
  embedShowNewRegistration: boolean
  embedTheme: EmbedTheme | null
}

export function EmbedCard({
  eventId,
  embedEnabled,
  allowedOrigins,
  embedShowTitle,
  embedShowLocation,
  embedShowTickets,
  embedShowNewRegistration,
  embedTheme,
}: EmbedCardProps) {
  const setEmbedSettings = useMutation(api.events.setEmbedSettings)
  const [enabled, setEnabled] = useState(embedEnabled)
  const [showTitle, setShowTitle] = useState(embedShowTitle)
  const [showLocation, setShowLocation] = useState(embedShowLocation)
  const [showTickets, setShowTickets] = useState(embedShowTickets)
  const [showNewRegistration, setShowNewRegistration] = useState(embedShowNewRegistration)
  const [originsText, setOriginsText] = useState(allowedOrigins.join('\n'))
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  // L'Aspetto è o tutto o niente (ADR 0013): la spunta decide se l'Evento ne
  // ha uno, la bozza tiene i sei valori. Partendo dal default anziché da campi
  // vuoti, cambiare il solo colore del bottone resta una sola modifica.
  const [themed, setThemed] = useState(embedTheme !== null)
  const [draft, setDraft] = useState<EmbedTheme>(embedTheme ?? DEFAULT_EMBED_THEME)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const { valid, invalid } = useMemo(() => parseAllowedOrigins(originsText), [originsText])

  const snippet = useMemo(() => {
    if (!origin) return ''
    return `<script src="${origin}/embed.js" data-event-id="${eventId}" async></script>`
  }, [origin, eventId])

  // I colori si digitano, quindi possono essere a metà mentre si scrive. La
  // bozza conserva il testo grezzo; l'anteprima e il salvataggio usano la
  // versione normalizzata, e i campi malformati si segnalano da soli.
  const invalidColours = useMemo(() => {
    const labels: string[] = []
    if (normalizeHexColor(draft.accent) === null) labels.push('accento')
    if (normalizeHexColor(draft.foreground) === null) labels.push('testo')
    if (normalizeHexColor(draft.background) === null) labels.push('sfondo')
    return labels
  }, [draft])

  const resolved: EmbedTheme = useMemo(
    () => ({
      ...draft,
      accent: normalizeHexColor(draft.accent) ?? DEFAULT_EMBED_THEME.accent,
      foreground: normalizeHexColor(draft.foreground) ?? DEFAULT_EMBED_THEME.foreground,
      background: normalizeHexColor(draft.background) ?? DEFAULT_EMBED_THEME.background,
    }),
    [draft],
  )

  const ratio = contrastRatio(resolved.foreground, resolved.background)
  const contrastOk = ratio >= EMBED_CONTRAST_MIN

  const fontItems = EMBED_FONT_STACK_KEYS.map((key) => ({
    value: key,
    label: EMBED_FONT_STACKS[key].label,
  }))

  function patchDraft(patch: Partial<EmbedTheme>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  async function handleSave() {
    if (invalid.length > 0) {
      toast.error(`Origini non valide: ${invalid.join(', ')}`)
      return
    }
    if (enabled && valid.length === 0) {
      toast.error('Aggiungi almeno un dominio autorizzato per abilitare l’incorporamento')
      return
    }
    if (themed && invalidColours.length > 0) {
      toast.error(`Colori non validi: ${invalidColours.join(', ')}. Usa il formato #rrggbb.`)
      return
    }
    setSaving(true)
    try {
      const result = await setEmbedSettings({
        eventId: eventId as Id<'events'>,
        embedEnabled: enabled,
        allowedOrigins: valid,
        embedShowTitle: showTitle,
        embedShowLocation: showLocation,
        embedShowTickets: showTickets,
        embedShowNewRegistration: showNewRegistration,
        embedTheme: themed ? resolved : null,
      })
      setOriginsText(result.allowedOrigins.join('\n'))
      if (result.embedTheme) setDraft(result.embedTheme)
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

        {/* Intestazione del form incorporato. Le caselle restano attive anche a
            incorporamento spento: si configura prima, si accende poi. */}
        <fieldset className="grid gap-3 border-t border-border pt-4">
          <legend className="sr-only">Intestazione del form incorporato</legend>
          <p className="text-sm text-muted-foreground">
            Il sito che ospita il form di solito dice già lui di che evento si tratta e dove:
            togli qui ciò che sarebbe una ripetizione. Nascondere è solo visivo — chi usa uno
            screen reader continua a sentire il titolo dell&apos;evento.
          </p>

          <Label className="flex items-start gap-3">
            <Checkbox
              checked={showTitle}
              onCheckedChange={(value) => setShowTitle(value === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Mostra il titolo</span>
              <span className="text-sm text-muted-foreground">
                Il nome dell&apos;evento sopra il form incorporato.
              </span>
            </span>
          </Label>

          <Label className="flex items-start gap-3">
            <Checkbox
              checked={showLocation}
              onCheckedChange={(value) => setShowLocation(value === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Mostra il luogo</span>
              <span className="text-sm text-muted-foreground">
                Il luogo dell&apos;evento sotto il titolo.
              </span>
            </span>
          </Label>
        </fieldset>

        {/* Esito della Prenotazione dentro l'iframe (ADR 0014). Il bottone di
            download non è qui: non è spegnibile, perché con i biglietti via
            resta l'unica presa di chi non riceve l'email. */}
        <fieldset className="grid gap-3 border-t border-border pt-4">
          <legend className="sr-only">Schermata di conferma nel form incorporato</legend>
          <p className="text-sm text-muted-foreground">
            Cosa resta sulla schermata che segue l&apos;iscrizione. Il bottone per scaricare il
            PDF dei biglietti c&apos;è sempre. I testi di quella schermata si scrivono invece nel
            form dell&apos;evento, e valgono anche sulla pagina pubblica.
          </p>

          <Label className="flex items-start gap-3">
            <Checkbox
              checked={showTickets}
              onCheckedChange={(value) => setShowTickets(value === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Mostra i biglietti</span>
              <span className="text-sm text-muted-foreground">
                I QR code a schermo, uno per persona. Toglierli accorcia molto l&apos;iframe
                dentro la pagina che lo ospita: i biglietti restano nell&apos;email e nel PDF.
              </span>
            </span>
          </Label>

          <Label className="flex items-start gap-3">
            <Checkbox
              checked={showNewRegistration}
              onCheckedChange={(value) => setShowNewRegistration(value === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Mostra «Nuova registrazione»</span>
              <span className="text-sm text-muted-foreground">
                Il bottone che riapre il form. Serve al banco accoglienza; per un visitatore è
                un vicolo cieco, perché con la stessa email non può iscriversi due volte.
              </span>
            </span>
          </Label>
        </fieldset>

        <div className="grid gap-4 border-t border-border pt-4">
          <Label className="flex items-start gap-3">
            <Checkbox
              checked={themed}
              onCheckedChange={(value) => setThemed(value === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">Personalizza l&apos;aspetto</span>
              <span className="text-sm text-muted-foreground">
                Fa prendere al form i colori e il carattere del sito che lo ospita. Senza
                personalizzazione il form usa l&apos;aspetto predefinito.
              </span>
            </span>
          </Label>

          {themed && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ColourField
                id="theme-accent"
                label="Colore accento"
                hint="Bottoni e focus"
                value={draft.accent}
                onChange={(accent) => patchDraft({ accent })}
              />
              <ColourField
                id="theme-foreground"
                label="Colore testo"
                hint="Testi e titoli"
                value={draft.foreground}
                onChange={(foreground) => patchDraft({ foreground })}
              />
              <ColourField
                id="theme-background"
                label="Colore sfondo"
                hint="Sempre opaco"
                value={draft.background}
                onChange={(background) => patchDraft({ background })}
              />

              <div className="grid gap-2">
                <Label htmlFor="theme-font">Carattere</Label>
                <Select
                  items={fontItems}
                  value={draft.fontStack}
                  onValueChange={(value) =>
                    patchDraft({ fontStack: (value ?? 'system') as EmbedFontStack })
                  }
                >
                  <SelectTrigger id="theme-font" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fontItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="theme-scale">Scala del testo</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="theme-scale"
                    type="number"
                    inputMode="numeric"
                    min={EMBED_TEXT_SCALE_MIN}
                    max={EMBED_TEXT_SCALE_MAX}
                    value={draft.textScale}
                    onChange={(e) => patchDraft({ textScale: Number(e.target.value) })}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Scala tutto il testo in proporzione, da {EMBED_TEXT_SCALE_MIN} a{' '}
                  {EMBED_TEXT_SCALE_MAX}.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="theme-radius">Raggio degli angoli</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="theme-radius"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={EMBED_RADIUS_MAX}
                    value={draft.radius}
                    onChange={(e) => patchDraft({ radius: Number(e.target.value) })}
                  />
                  <span className="text-sm text-muted-foreground">px</span>
                </div>
                <p className="text-sm text-muted-foreground">0 per angoli vivi.</p>
              </div>

              <div className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-medium">Anteprima</span>
                <ThemeSpecimen theme={resolved} />
                <p className={contrastOk ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
                  Contrasto fra testo e sfondo {ratio.toFixed(1)}:1
                  {contrastOk
                    ? ' — sufficiente (soglia AA 4,5:1).'
                    : ` — sotto la soglia AA di ${EMBED_CONTRAST_MIN}:1. Il testo sarà poco leggibile; puoi salvare comunque.`}
                </p>
              </div>
            </div>
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

/**
 * Selettore nativo più campo di testo sullo stesso valore: dal selettore si
 * sceglie a occhio, nel campo si incolla l'esadecimale del manuale di brand,
 * che è come i colori arrivano davvero. Il selettore vuole sempre un `#rrggbb`
 * valido, quindi mentre si digita ripiega sul nero senza toccare la bozza.
 */
function ColourField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  const normalized = normalizeHexColor(value)
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: selettore`}
          value={normalized ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#rrggbb"
          className="font-mono text-xs"
          aria-invalid={normalized === null}
        />
      </div>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

/**
 * Campione dell'Aspetto: un titolo, una riga attenuata, un campo e un bottone.
 * Non è il form vero — quello vive in un iframe e prenoterebbe sul serio — ma
 * mostra gli unici quattro elementi in cui i sei valori si vedono, compresi i
 * token derivati (il bordo del campo e il testo attenuato *non* sono scelti
 * dall'admin: nascono dal colore del testo, ed è qui che si controlla che
 * l'automatismo abbia prodotto qualcosa di sensato).
 *
 * La scala vive come `font-size` del contenitore e le misure interne sono in
 * `em`: nel pannello admin le utility `rem` di Tailwind guarderebbero la
 * radice della pagina admin, e il campione mentirebbe sulla scala.
 */
function ThemeSpecimen({ theme }: { theme: EmbedTheme }) {
  const style = {
    ...embedThemeCssVars(theme),
    fontFamily: embedThemeFontFamily(theme),
    backgroundColor: theme.background,
    fontSize: `${theme.textScale}%`,
  } as CSSProperties

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div style={style} className="flex flex-col gap-3 p-4">
        <div>
          <p style={{ color: 'var(--foreground)', fontSize: '1.125em', fontWeight: 600 }}>
            Titolo dell&apos;evento
          </p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875em' }}>
            Luogo · 26 settembre 2026
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375em' }}>
          <span style={{ color: 'var(--foreground)', fontSize: '0.875em' }}>Nome e cognome</span>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--background)',
              height: '2.25em',
            }}
          />
        </div>
        <button
          type="button"
          disabled
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            borderRadius: 'var(--radius)',
            padding: '0.5em 1em',
            fontSize: '0.875em',
            fontWeight: 500,
            alignSelf: 'flex-start',
          }}
        >
          Conferma la prenotazione
        </button>
      </div>
    </div>
  )
}
