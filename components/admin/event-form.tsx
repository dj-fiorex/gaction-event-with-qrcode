'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { eventSchema, type EventInput } from '@/lib/schemas'
import { activityRemovalWarning, lostSelections, type ActivityImpact } from '@/lib/activity-removal'
import { fromDatetimeLocalValue } from '@/lib/format'
import { typedZodResolver } from '@/lib/zod-resolver'
import { EventImageField } from '@/components/admin/event-image-field'
import { messageFromError } from '@/lib/errors'

/**
 * Editor del Testo dell'email di conferma (issue #42). Caricato solo nel
 * browser e solo quando il form è aperto: porta con sé CodeMirror e
 * `mjml-browser`, che non hanno nulla da fare nel bundle iniziale né in SSR.
 */
const EmailBodyEditor = dynamic(
  () => import('@/components/admin/email-body-editor').then((m) => m.EmailBodyEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse rounded-md border border-border bg-muted/40" />
    ),
  },
)

const emptyActivity = {
  title: '',
  start: '',
  end: '',
  slotDurationMinutes: 30,
  capacityPerSlot: 10,
  freeAccess: false,
}

const defaultValues: EventInput = {
  title: '',
  description: '',
  location: '',
  organizerEmail: '',
  imageStorageId: undefined,
  startsAt: '',
  endsAt: '',
  activityPolicy: 'free',
  minActivities: 1,
  allowOverlap: false,
  checkInToleranceMinutes: 15,
  allowQrReuse: false,
  requireAccount: false,
  confirmParticipation: false,
  collectNames: true,
  collectAllergies: false,
  collectNotes: false,
  recordExit: false,
  emailSubject: '',
  emailBody: '',
  emailShowSummary: true,
  ticketHeader: 'title',
  resultTitle: '',
  resultBody: '',
  resultClosing: '',
  privacyNotice: '',
  allowChildren: false,
  maxChildrenPerRegistration: 2,
  allowCompanions: false,
  maxCompanionsPerRegistration: 1,
  maxCompanionsWithChildren: undefined,
  checkInAccess: 'private',
  checkInPassword: '',
  activities: [emptyActivity],
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}

interface EventFormProps {
  mode: 'create' | 'edit'
  /** Obbligatorio in modalità "edit": id dell'Evento da aggiornare. */
  eventId?: string
  /** Valori iniziali del form (in "edit" derivano dall'Evento esistente). */
  initialValues?: EventInput
  /** In "edit": URL dell'immagine già salvata, per l'anteprima. */
  initialImageUrl?: string | null
  /** In "edit": indica se l'Evento ha già una password di check-in impostata. */
  hasCheckInPassword?: boolean
  /**
   * In "edit": quante Prenotazioni e Persone perderebbero la selezione se
   * l'Attività — o una sua fascia — sparisse (ADR 0008). `undefined` finché il
   * conteggio non è arrivato dal server: finché è così il salvataggio resta
   * bloccato, perché salvare senza saperlo è salvare senza avvisare.
   */
  activityImpact?: ActivityImpact[]
}

export function EventForm({
  mode,
  eventId,
  initialValues,
  initialImageUrl,
  hasCheckInPassword,
  activityImpact,
}: EventFormProps) {
  const router = useRouter()
  const createEvent = useMutation(api.events.create)
  const updateEvent = useMutation(api.events.update)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EventInput>({
    resolver: typedZodResolver(eventSchema),
    defaultValues: initialValues ?? defaultValues,
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'activities' })

  /**
   * La lista Attività non vuota. È lei a decidere quali impostazioni hanno un
   * referente (ADR 0010): con zero Attività, policy, minimo, sovrapposizioni e
   * tolleranza non si chiedono affatto.
   */
  const hasActivities = fields.length > 0

  /**
   * In modifica il salvataggio aspetta il conteggio: senza, l'avviso non
   * saprebbe chi sta per perdere la selezione e si salverebbe in silenzio.
   */
  const impactPending = mode === 'edit' && activityImpact === undefined

  const activityPolicy = watch('activityPolicy')
  const allowChildren = watch('allowChildren')
  const allowCompanions = watch('allowCompanions')
  const checkInAccess = watch('checkInAccess')
  const ticketHeader = watch('ticketHeader')
  const imageStorageId = watch('imageStorageId')
  const maxCompanionsWithChildren = watch('maxCompanionsWithChildren')
  const familyRuleActive = maxCompanionsWithChildren !== undefined

  /** Regola del nucleo familiare (issue #35): non ha senso senza Figli e Ospiti entrambi ammessi. */
  function handleFamilyRuleDependencyToggle(nextValue: boolean) {
    if (!nextValue) setValue('maxCompanionsWithChildren', undefined)
  }

  const onSubmit = handleSubmit(async (values) => {
    // L'admin deve sapere chi colpisce prima di salvare, non dopo.
    const warning = activityRemovalWarning(
      lostSelections({
        initial: initialValues?.activities ?? [],
        submitted: values.activities,
        impact: activityImpact,
      }),
    )
    if (warning && !window.confirm(warning)) return

    setSubmitting(true)
    try {
      const payload = {
        ...values,
        imageStorageId: values.imageStorageId
          ? (values.imageStorageId as Id<'_storage'>)
          : undefined,
        // Date proprie dell'Evento (ADR 0009): stesso trattamento degli orari
        // delle Attività — il fuso lo conosce solo il browser. Vuote restano
        // vuote, ed è così che il server capisce «non dichiarata».
        startsAt: fromDatetimeLocalValue(values.startsAt ?? ''),
        endsAt: fromDatetimeLocalValue(values.endsAt ?? ''),
        activities: values.activities.map(({ id, start, end, ...activity }) => ({
          ...activity,
          // Il fuso lo conosce solo il browser: un valore `datetime-local`
          // interpretato dal server, che gira in UTC, sposterebbe gli orari di
          // un offset a ogni salvataggio — e uno Slot spostato è uno Slot nuovo.
          start: fromDatetimeLocalValue(start),
          end: fromDatetimeLocalValue(end),
          // L'id torna al server solo se il form l'ha ricevuto: un'Attività
          // appena aggiunta ha il campo vuoto e va inserita, non riconosciuta.
          ...(id ? { id: id as Id<'activities'> } : {}),
        })),
      }
      if (mode === 'edit' && eventId) {
        await updateEvent({ eventId: eventId as Id<'events'>, ...payload })
      } else {
        await createEvent(payload)
      }
      toast.success(mode === 'edit' ? 'Evento aggiornato' : 'Evento creato')
      router.push('/admin')
    } catch (error) {
      const fallback =
        mode === 'edit' ? 'Errore durante il salvataggio' : 'Errore durante la creazione'
      toast.error(messageFromError(error, fallback))
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="title">Titolo</Label>
        <Input id="title" {...register('title')} aria-invalid={!!errors.title} />
        <FieldError message={errors.title?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Descrizione</Label>
        <Textarea id="description" rows={3} {...register('description')} aria-invalid={!!errors.description} />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="location">Luogo</Label>
        <Input id="location" {...register('location')} aria-invalid={!!errors.location} />
        <FieldError message={errors.location?.message} />
      </div>

      {/* E-mail dell'organizzatore (ADR 0023). Sta fra i campi generali e non
          nel riquadro «Email di conferma» perché quello governa un'email che
          *parte*, questa è un indirizzo che *riceve* — e la vicinanza farebbe
          credere che sia il reply-to della conferma, che non è. */}
      <div className="grid gap-2">
        <Label htmlFor="organizerEmail">E-mail dell&rsquo;organizzatore</Label>
        <Input
          id="organizerEmail"
          type="email"
          inputMode="email"
          placeholder="info@esempio.it"
          {...register('organizerEmail')}
          aria-invalid={!!errors.organizerEmail}
          aria-describedby="organizerEmailHint"
        />
        <p id="organizerEmailHint" className="text-sm text-muted-foreground text-pretty">
          Facoltativa. Compare a chi trova la propria e-mail gi&agrave; usata per questo evento,
          come recapito a cui scrivere per cambiare risposta. Lasciandola vuota il messaggio dice
          soltanto di scrivere all&rsquo;organizzatore.
        </p>
        <FieldError message={errors.organizerEmail?.message} />
      </div>

      <Controller
        control={control}
        name="imageStorageId"
        render={({ field }) => (
          <EventImageField
            value={field.value}
            initialImageUrl={initialImageUrl}
            onChange={field.onChange}
            disabled={submitting}
          />
        )}
      />

      {/* Data dell'Evento (ADR 0009) */}
      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div>
          <legend className="font-medium">Data dell&rsquo;evento</legend>
          <p className="text-sm text-muted-foreground">
            Facoltativa. Se non la indichi, la data si ricava dalle attività: il primo inizio e
            l&rsquo;ultima fine. Se la indichi vince lei, anche quando le attività dicono altro.
            La fine puoi lasciarla vuota: meglio nessun orario che uno inventato sul biglietto.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="event-starts-at">Inizio</Label>
            <Input
              id="event-starts-at"
              type="datetime-local"
              {...register('startsAt')}
              aria-invalid={!!errors.startsAt}
            />
            <FieldError message={errors.startsAt?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="event-ends-at">Fine</Label>
            <Input
              id="event-ends-at"
              type="datetime-local"
              {...register('endsAt')}
              aria-invalid={!!errors.endsAt}
            />
            <FieldError message={errors.endsAt?.message} />
          </div>
        </div>
      </fieldset>

      {/* Attività */}
      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <legend className="font-medium">Attività</legend>
            <p className="text-sm text-muted-foreground">
              Ogni attività genera automaticamente gli slot dalla durata indicata.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => append(emptyActivity)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Aggiungi
          </Button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
            {/* Identità dell'Attività (ADR 0008): rimandata al server perché la
                riconosca invece di ricrearla. Vuota = Attività nuova. Passa da
                un Controller e non da `register` perché il valore non è
                digitabile: dopo un riordino o una rimozione dev'essere quello
                che lo stato del form dice, non quello rimasto nel DOM. */}
            <Controller
              control={control}
              name={`activities.${index}.id` as const}
              render={({ field }) => (
                <input type="hidden" name={field.name} value={field.value ?? ''} readOnly />
              )}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">Attività {index + 1}</span>
              {/* Nessun guard sull'ultima Attività (ADR 0010): «nessuna
                  Attività» si esprime con la lista vuota, non con un
                  interruttore che potrebbe contraddirla. */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                aria-label={`Rimuovi attività ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`act-title-${index}`}>Nome attività</Label>
              <Input
                id={`act-title-${index}`}
                {...register(`activities.${index}.title` as const)}
                aria-invalid={!!errors.activities?.[index]?.title}
              />
              <FieldError message={errors.activities?.[index]?.title?.message} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`act-start-${index}`}>Inizio</Label>
                <Input
                  id={`act-start-${index}`}
                  type="datetime-local"
                  {...register(`activities.${index}.start` as const)}
                  aria-invalid={!!errors.activities?.[index]?.start}
                />
                <FieldError message={errors.activities?.[index]?.start?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`act-end-${index}`}>Fine</Label>
                <Input
                  id={`act-end-${index}`}
                  type="datetime-local"
                  {...register(`activities.${index}.end` as const)}
                  aria-invalid={!!errors.activities?.[index]?.end}
                />
                <FieldError message={errors.activities?.[index]?.end?.message} />
              </div>
            </div>

            {/* Attività ad accesso libero (ADR 0011): con il flag attivo non
                ci sono numeri da inventare, quindi Durata e capienza non si
                chiedono affatto invece di restare lì disabilitate. */}
            <div className="flex items-start gap-3">
              <Controller
                control={control}
                name={`activities.${index}.freeAccess` as const}
                render={({ field }) => (
                  <Checkbox
                    id={`act-free-${index}`}
                    className="mt-0.5"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <div className="grid gap-1">
                <Label htmlFor={`act-free-${index}`} className="font-normal">
                  Accesso libero (senza fasce né posti)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Si partecipa quando si vuole, dentro la finestra oraria. Nel form pubblico
                  l&rsquo;iscritto risponde solo «mi interessa» o «non mi interessa», e
                  l&rsquo;attività non entra nella policy di selezione né nel controllo delle
                  sovrapposizioni.
                </p>
              </div>
            </div>

            <div
              className="grid gap-3 sm:grid-cols-2"
              hidden={watch(`activities.${index}.freeAccess` as const)}
            >
              <div className="grid gap-2">
                <Label htmlFor={`act-duration-${index}`}>Durata slot (minuti)</Label>
                <Input
                  id={`act-duration-${index}`}
                  type="number"
                  min={5}
                  step={5}
                  {...register(`activities.${index}.slotDurationMinutes` as const, { valueAsNumber: true })}
                  aria-invalid={!!errors.activities?.[index]?.slotDurationMinutes}
                />
                <FieldError message={errors.activities?.[index]?.slotDurationMinutes?.message} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`act-capacity-${index}`}>Posti per slot</Label>
                <Input
                  id={`act-capacity-${index}`}
                  type="number"
                  min={1}
                  {...register(`activities.${index}.capacityPerSlot` as const, { valueAsNumber: true })}
                  aria-invalid={!!errors.activities?.[index]?.capacityPerSlot}
                />
                <FieldError message={errors.activities?.[index]?.capacityPerSlot?.message} />
              </div>
            </div>
          </div>
        ))}
        {!hasActivities && (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nessuna attività: l&rsquo;evento avrà solo l&rsquo;ingresso (e l&rsquo;uscita, se
            attiva), nessuna fascia oraria da prenotare e nessun tetto di posti.
          </p>
        )}
        <FieldError message={errors.activities?.message} />
      </fieldset>

      {/* Regole di selezione. Senza Attività non hanno referente (ADR 0010):
          non si chiedono, e il server le normalizza a `free`/`0`. Tornano con
          la prima Attività aggiunta. */}
      {hasActivities && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="activityPolicy">Selezione attività</Label>
            <Controller
              control={control}
              name="activityPolicy"
              render={({ field }) => (
                <Select
                  items={[
                    { value: 'free', label: 'Libera' },
                    { value: 'min', label: 'Minimo N attività' },
                    { value: 'all', label: 'Tutte obbligatorie' },
                  ]}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="activityPolicy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Libera</SelectItem>
                    <SelectItem value="min">Minimo N attività</SelectItem>
                    <SelectItem value="all">Tutte obbligatorie</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {activityPolicy === 'min' && (
            <div className="grid gap-2">
              <Label htmlFor="minActivities">Minimo attività</Label>
              <Input
                id="minActivities"
                type="number"
                min={1}
                {...register('minActivities', { valueAsNumber: true })}
                aria-invalid={!!errors.minActivities}
              />
              <FieldError message={errors.minActivities?.message} />
            </div>
          )}
        </div>
      )}

      {/* Sovrapposizioni e Tolleranza check-in parlano entrambe di Slot:
          l'Ingresso e l'Uscita non hanno finestra oraria (ADR 0010). */}
      {hasActivities && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="allowOverlap"
              render={({ field }) => (
                <Checkbox
                  id="allowOverlap"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <Label htmlFor="allowOverlap" className="font-normal">
              Permetti slot sovrapposti
            </Label>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tolerance">Tolleranza check-in (minuti)</Label>
            <Input
              id="tolerance"
              type="number"
              min={0}
              {...register('checkInToleranceMinutes', { valueAsNumber: true })}
              aria-invalid={!!errors.checkInToleranceMinutes}
            />
            <FieldError message={errors.checkInToleranceMinutes?.message} />
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="allowQrReuse"
          render={({ field }) => (
            <Checkbox
              id="allowQrReuse"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <div className="grid gap-1">
          <Label htmlFor="allowQrReuse" className="font-normal">
            Consenti riuso del QR
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attivo, lo stesso QR può essere scansionato più volte (ingresso evento e attività):
            ogni rientro resta valido e viene conteggiato.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="recordExit"
          render={({ field }) => (
            <Checkbox
              id="recordExit"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <div className="grid gap-1">
          <Label htmlFor="recordExit" className="font-normal">
            Registra l&apos;uscita
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attivo, lo scanner offre la modalità «Uscita» accanto a ingresso evento e accesso
            attività. L&apos;uscita richiede un ingresso già registrato; le ri-uscite seguono la
            stessa regola del riuso del QR.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="requireAccount"
          render={({ field }) => (
            <Checkbox
              id="requireAccount"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <div className="grid gap-1">
          <Label htmlFor="requireAccount" className="font-normal">
            Prenotazione riservata agli account
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attivo, solo i Membri con email verificata possono completare la prenotazione.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="confirmParticipation"
          render={({ field }) => (
            <Checkbox
              id="confirmParticipation"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <div className="grid gap-1">
          <Label htmlFor="confirmParticipation" className="font-normal">
            Conferma di partecipazione
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attivo, il form pubblico chiede prima «Confermi la partecipazione? sì/no»: il «no»
            registra una Rinuncia (nome + email, nessuna Persona, nessun posto, nessun QR).
          </p>
        </div>
      </div>

      {/* Accesso al check-in */}
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div>
          <legend className="font-medium">Accesso al check-in</legend>
          <p className="text-sm text-muted-foreground">
            Scegli chi può aprire l&apos;interfaccia di scansione tramite il link univoco
            dell&apos;evento.
          </p>
        </div>

        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="checkInAccess">Modalità</Label>
          <Controller
            control={control}
            name="checkInAccess"
            render={({ field }) => (
              <Select
                items={[
                  { value: 'private', label: 'Privato (solo admin/staff)' },
                  { value: 'password', label: 'Protetto da password' },
                ]}
                value={field.value}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="checkInAccess" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Privato (solo admin/staff)</SelectItem>
                  <SelectItem value="password">Protetto da password</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-sm text-muted-foreground">
            {checkInAccess === 'password'
              ? 'Chiunque abbia il link può accedere inserendo la password.'
              : 'Il link richiede una sessione admin/staff attiva.'}
          </p>
        </div>

        {checkInAccess === 'password' && (
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="checkInPassword">
              {mode === 'edit' && hasCheckInPassword ? 'Nuova password' : 'Password'}
            </Label>
            <Input
              id="checkInPassword"
              type="password"
              autoComplete="new-password"
              {...register('checkInPassword')}
              aria-invalid={!!errors.checkInPassword}
            />
            <FieldError message={errors.checkInPassword?.message} />
            {mode === 'edit' && hasCheckInPassword && (
              <p className="text-sm text-muted-foreground">
                Una password è già impostata. Lascia vuoto per mantenerla.
              </p>
            )}
          </div>
        )}
      </fieldset>

      {/* Figli e ospiti */}
      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="allowChildren"
            render={({ field }) => (
              <Checkbox
                id="allowChildren"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked === true)
                  handleFamilyRuleDependencyToggle(checked === true)
                }}
              />
            )}
          />
          <Label htmlFor="allowChildren" className="font-normal">
            Ammetti figli
          </Label>
        </div>
        {allowChildren && (
          <div className="grid gap-2 sm:max-w-60">
            <Label htmlFor="maxChildren">Max figli per registrazione</Label>
            <Input
              id="maxChildren"
              type="number"
              min={0}
              {...register('maxChildrenPerRegistration', { valueAsNumber: true })}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="allowCompanions"
            render={({ field }) => (
              <Checkbox
                id="allowCompanions"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked === true)
                  handleFamilyRuleDependencyToggle(checked === true)
                }}
              />
            )}
          />
          <Label htmlFor="allowCompanions" className="font-normal">
            Ammetti ospiti
          </Label>
        </div>
        {allowCompanions && (
          <div className="grid gap-2 sm:max-w-60">
            <Label htmlFor="maxCompanions">Max ospiti per registrazione</Label>
            <Input
              id="maxCompanions"
              type="number"
              min={0}
              {...register('maxCompanionsPerRegistration', { valueAsNumber: true })}
            />
          </div>
        )}

        {allowChildren && allowCompanions && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="familyRuleEnabled"
                checked={familyRuleActive}
                onCheckedChange={(checked) =>
                  setValue('maxCompanionsWithChildren', checked === true ? 1 : undefined, {
                    shouldValidate: true,
                  })
                }
              />
              <Label htmlFor="familyRuleEnabled" className="font-normal">
                Regola del nucleo familiare
              </Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Se attiva, il form chiede prima «Hai figli minorenni a carico?»: con figli, il numero
              di Ospiti è limitato al valore qui sotto; senza figli resta il massimo impostato sopra.
            </p>
            {familyRuleActive && (
              <div className="grid gap-2 sm:max-w-60">
                <Label htmlFor="maxCompanionsWithChildren">Max Ospiti quando ci sono Figli</Label>
                <Input
                  id="maxCompanionsWithChildren"
                  type="number"
                  min={0}
                  {...register('maxCompanionsWithChildren', { valueAsNumber: true })}
                  aria-invalid={!!errors.maxCompanionsWithChildren}
                />
                <FieldError message={errors.maxCompanionsWithChildren?.message} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="collectNames"
          render={({ field }) => (
            <Checkbox
              id="collectNames"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <div className="grid gap-1">
          <Label htmlFor="collectNames" className="font-normal">
            Raccolta nomi
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attiva (predefinito), il form chiede il nome di ogni Figlio e Ospite. Se disattiva,
            sono identificati solo dall&apos;etichetta posizionale («Figlio 1», «Ospite 1»); i Figli
            mantengono l&apos;età.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="collectAllergies"
          render={({ field }) => (
            <Checkbox
              id="collectAllergies"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <div className="grid gap-1">
          <Label htmlFor="collectAllergies" className="font-normal">
            Chiedi allergie/intolleranze
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attiva, il form chiede a ogni persona (iscritto, figli, ospiti) una dichiarazione
            facoltativa di allergie e intolleranze. È un dato sanitario: viene mostrato nel pannello
            admin, nell&apos;export, nell&apos;email di conferma e sullo scanner.
          </p>
        </div>
      </div>

      {/* Nota (ADR 0019): un solo interruttore per i due rami del form pubblico. */}
      <div className="flex items-start gap-2 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="collectNotes"
          render={({ field }) => (
            <Checkbox
              id="collectNotes"
              className="mt-0.5"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <div className="grid gap-1">
          <Label htmlFor="collectNotes" className="font-normal">
            Chiedi una nota
          </Label>
          <p className="text-sm text-muted-foreground">
            Se attiva, il form chiede in fondo una nota libera e facoltativa, <strong>una per
            risposta</strong> (non per persona) — sia a chi si iscrive sia a chi rinuncia. La leggi
            qui nel pannello e nell&apos;export: non viene rimandata nell&apos;email di conferma, non
            compare sui biglietti e non arriva allo scanner.
          </p>
        </div>
      </div>

      {/* Esito della Prenotazione (ADR 0014) */}
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div>
          <legend className="font-medium">Esito della prenotazione</legend>
          <p className="text-sm text-muted-foreground">
            Cosa legge chi ha appena finito di iscriversi, sulla schermata di conferma. Testo
            semplice: una riga vuota separa i paragrafi, e gli indirizzi email diventano
            cliccabili da soli. Ogni campo lasciato vuoto usa il testo predefinito, e la chiusura
            vuota semplicemente non compare. I biglietti e il bottone «Nuova registrazione» si
            spengono invece dalla scheda «Incorporamento», e valgono solo dentro l&rsquo;iframe.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="resultTitle">Titolo</Label>
          <Input
            id="resultTitle"
            placeholder="Registrazione confermata"
            {...register('resultTitle')}
            aria-invalid={!!errors.resultTitle}
          />
          <FieldError message={errors.resultTitle?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="resultBody">Corpo</Label>
          <Textarea
            id="resultBody"
            rows={6}
            placeholder="Grazie! Ti abbiamo appena inviato un’email con la conferma e i QR code di ingresso."
            {...register('resultBody')}
            aria-invalid={!!errors.resultBody}
          />
          <p className="text-sm text-muted-foreground">
            Compare sotto al titolo, sopra al bottone di download: l&rsquo;ultima riga può
            invitare a scaricare il PDF, che sta subito sotto.
          </p>
          <FieldError message={errors.resultBody?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="resultClosing">Chiusura</Label>
          <Textarea
            id="resultClosing"
            rows={3}
            placeholder="Ti aspettiamo il 26 settembre alle 15.00."
            {...register('resultClosing')}
            aria-invalid={!!errors.resultClosing}
          />
          <p className="text-sm text-muted-foreground">
            L&rsquo;ultima cosa della pagina, sotto ai biglietti. Vuota non compare.
          </p>
          <FieldError message={errors.resultClosing?.message} />
        </div>
      </fieldset>

      {/* Testo dell'email di conferma (issue #42) */}
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div>
          <legend className="font-medium">Email di conferma</legend>
          <p className="text-sm text-muted-foreground">
            Oggetto e corpo dell&rsquo;email inviata dopo una prenotazione. Il corpo si scrive in
            markdown e l&rsquo;anteprima a fianco è quella che arriva davvero; i QR code viaggiano
            nel PDF allegato. Nel corpo puoi scrivere <code>{'{{nome}}'}</code> e{' '}
            <code>{'{{cognome}}'}</code>: all&rsquo;invio diventano nome e cognome
            dell&rsquo;iscritto (l&rsquo;anteprima li mostra così come sono). Lasciando i campi
            vuoti si usa il testo predefinito.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="emailSubject">Oggetto</Label>
          <Input
            id="emailSubject"
            placeholder="Ticket per {nome evento}"
            {...register('emailSubject')}
            aria-invalid={!!errors.emailSubject}
          />
          <FieldError message={errors.emailSubject?.message} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="emailBody">Corpo</Label>
          <Controller
            control={control}
            name="emailBody"
            render={({ field }) => (
              <EmailBodyEditor value={field.value ?? ''} onChange={field.onChange} />
            )}
          />
          <FieldError message={errors.emailBody?.message} />
        </div>

        <div className="flex items-start gap-2">
          <Controller
            control={control}
            name="emailShowSummary"
            render={({ field }) => (
              <Checkbox
                id="emailShowSummary"
                className="mt-0.5"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <div className="grid gap-1">
            <Label htmlFor="emailShowSummary" className="font-normal">
              Aggiungi il riepilogo della prenotazione in coda all&rsquo;email
            </Label>
            <p className="text-sm text-muted-foreground">
              Un elenco con, per ogni persona, nome o etichetta, età, codice biglietto e allergie
              dichiarate. Spento, l&rsquo;email è il solo testo qui sopra: i codici restano nel PDF
              allegato e le allergie si leggono solo nel pannello.
            </p>
          </div>
        </div>
      </fieldset>

      {/* Intestazione del Biglietto */}
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div>
          <legend className="font-medium">Biglietto</legend>
          <p className="text-sm text-muted-foreground">
            Cosa sta in cima a ogni pagina del PDF dei biglietti — quello che si scarica e quello
            allegato all&rsquo;email. Data e luogo dell&rsquo;evento ci sono in entrambi i casi.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ticketHeader">Intestazione</Label>
          <Controller
            control={control}
            name="ticketHeader"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ticketHeader" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="title">Immagine grande e titolo dell&rsquo;evento</SelectItem>
                  <SelectItem value="image">Solo l&rsquo;immagine, in piccolo a sinistra</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-sm text-muted-foreground">
            {ticketHeader === 'image'
              ? imageStorageId
                ? 'L’immagine dell’evento prende il posto del titolo: niente copertina grande, niente titolo scritto sotto. Per gli eventi il cui marchio è l’immagine stessa. Il titolo resta nel nome del file e nelle proprietà del PDF.'
                : 'Questo evento non ha ancora un’immagine: finché manca, il biglietto stampa il titolo. Caricala qui sopra e l’intestazione cambia da sola.'
              : 'L’immagine dell’evento in grande, centrata, e sotto il titolo. È il biglietto di sempre.'}
          </p>
        </div>
      </fieldset>

      {/* Consenso all'informativa (ADR 0012) */}
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <div>
          <legend className="font-medium">Informativa privacy</legend>
          <p className="text-sm text-muted-foreground">
            Il testo accanto alla casella che chi si iscrive deve spuntare per proseguire. Lasciando
            il campo vuoto non compare alcuna casella e non viene chiesto nulla. Puoi riscriverlo
            quando vuoi: le risposte già raccolte conservano il testo che hanno accettato, quindi
            una correzione di oggi non cambia ciò che qualcuno ha letto il mese scorso.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="privacyNotice">Testo accanto alla casella</Label>
          <Textarea
            id="privacyNotice"
            rows={4}
            placeholder="Ho letto e accetto l’informativa sul trattamento dei dati personali."
            {...register('privacyNotice')}
            aria-invalid={!!errors.privacyNotice}
          />
          <FieldError message={errors.privacyNotice?.message} />
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin')}
          disabled={submitting}
        >
          Annulla
        </Button>
        <Button type="submit" disabled={submitting || impactPending}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {submitting
            ? mode === 'edit'
              ? 'Salvataggio…'
              : 'Creazione…'
            : mode === 'edit'
              ? 'Salva modifiche'
              : 'Crea evento'}
        </Button>
      </div>
    </form>
  )
}
