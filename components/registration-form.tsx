'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  makeDeclineSchema,
  makeRegistrationSchema,
  type DeclineInput,
  type RegistrationInput,
} from '@/lib/schemas'
import { typedZodResolver } from '@/lib/zod-resolver'
import { formatTime, formatTimeRange, formatDateRange, EVENT_TIME_ZONE } from '@/lib/format'
import { generateQrDataUrl } from '@/lib/qr-client'
import { intervalsOverlap } from '@/lib/slots'
import type { EventWithStats, RegisteredPerson, SlotWithAvailability } from '@/lib/types'
import { useCurrentUser } from '@/lib/use-current-user'
import { TicketResult } from './ticket-result'
import { messageFromError } from '@/lib/errors'

const NONE = '__none__'

/**
 * Informativa sui dati sanitari mostrata accanto ai campi «Allergie e
 * intolleranze» (issue #37). Testo del committente, con le sole parole del suo
 * settore rese neutre: il form è lo stesso per ogni Evento del prodotto, e
 * «catering» e «stabilimento» non valgono per un'assemblea.
 */
const ALLERGIES_PRIVACY_NOTICE =
  'Ci servono per organizzare al meglio il servizio e gli accessi. Il dato sarà visibile solo allo staff organizzativo e al personale agli ingressi, e comparirà nella tua e-mail di conferma. Lascia il campo vuoto se non hai niente da segnalare.'

/**
 * Concorda il numero con il sostantivo. Il conteggio delle Persone era già
 * dinamico, ma diceva «1 persone»: il committente l'ha letto come fisso, ed è
 * il plurale ad averglielo fatto credere.
 */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

const POLICY_HINT: Record<EventWithStats['activityPolicy'], (min: number) => string> = {
  all: () => 'Devi selezionare uno slot per ogni attività.',
  min: (min) => `Devi selezionare almeno ${min} attività.`,
  free: () => 'Seleziona le attività a cui vuoi partecipare.',
}

/**
 * Form pubblico di registrazione a un Evento.
 *
 * Presentazione senza contenitori: niente Card attorno al form e niente
 * riquadri attorno ai gruppi di campi. I gruppi sono separati da ritmo
 * verticale (largo tra le sezioni, stretto tra i campi di una sezione) e da
 * intestazioni vere — h2 per lo stato, h3 per le sezioni. Vale per tutti gli
 * stati che questo componente rende nello stesso slot (form, rinuncia,
 * avvisi) e per l'esito in TicketResult.
 *
 * Aggiungendo una sezione non reintrodurre bordi o fondi: la separazione la
 * fanno spazio e tipografia.
 */
export function RegistrationForm({
  event,
  embed = false,
}: {
  event: EventWithStats
  /** true quando il form è servito dentro l'iframe di incorporamento. */
  embed?: boolean
}) {
  const registerMutation = useMutation(api.registrations.register)
  const declineMutation = useMutation(api.declines.decline)
  const pathname = usePathname()
  const { user, isLoading } = useCurrentUser()
  const [tickets, setTickets] = useState<RegisteredPerson[] | null>(null)
  // Serve all'Esito per iscriversi all'esito della Consegna dell'email di
  // conferma (ADR 0016): il browser non riceve più alcun valore di ritorno
  // dall'invio, ma resta iscritto e lo vede arrivare.
  const [registrationId, setRegistrationId] = useState<Id<'registrations'> | null>(null)
  // Il destinatario effettivamente persistito, che per un Membro è l'email
  // dell'account e non quella digitata nel form.
  const [confirmedEmail, setConfirmedEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [slotByActivity, setSlotByActivity] = useState<Record<string, string>>({})
  const [participationAnswer, setParticipationAnswer] = useState<'yes' | 'no' | null>(
    event.confirmParticipation ? null : 'yes',
  )
  const [declined, setDeclined] = useState(false)
  const [decliningSubmitting, setDecliningSubmitting] = useState(false)
  const familyRuleActive = event.maxCompanionsWithChildren !== null
  const [familyBranch, setFamilyBranch] = useState<'children' | 'no-children' | null>(null)

  // Raccolta nomi (issue #36): con l'impostazione disattiva, i nomi di
  // Figli/Ospiti non sono raccolti né validati — il server assegna l'Etichetta
  // posizionale e ignora eventuali nomi inviati.
  const collectNames = event.collectNames
  // Allergie e intolleranze (issue #37): un campo facoltativo per ogni blocco
  // Persona. Con l'impostazione disattiva nessun campo compare e il server
  // ignora comunque qualsiasi dichiarazione inviata.
  const collectAllergies = event.collectAllergies
  // Consenso all'informativa (ADR 0012): la casella compare solo se l'admin ha
  // scritto un'informativa per questo Evento. Il rifiuto che conta è comunque
  // quello della mutation — qui si evita solo un viaggio inutile al server.
  const privacyNotice = event.privacyNotice.trim()
  const requiresPrivacy = privacyNotice.length > 0
  const registrationResolver = useMemo(
    () => typedZodResolver(makeRegistrationSchema(collectNames, requiresPrivacy)),
    [collectNames, requiresPrivacy],
  )

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegistrationInput>({
    resolver: registrationResolver,
    defaultValues: {
      eventId: event.id,
      userName: '',
      contactEmail: '',
      userAllergies: '',
      children: [],
      companions: [],
      selections: [],
      privacyAccepted: false,
    },
  })

  const childrenArray = useFieldArray({ control, name: 'children' })
  const companionsArray = useFieldArray({ control, name: 'companions' })

  // Regola del nucleo familiare (issue #35): la risposta al ramo determina quali
  // sezioni mostrare e il cap Ospiti applicabile. Cambiare risposta azzera le
  // persone già aggiunte, perché i cap validi differiscono per ramo.
  function selectFamilyBranch(branch: 'children' | 'no-children') {
    setFamilyBranch(branch)
    childrenArray.replace([])
    companionsArray.replace([])
  }

  const companionsMax = familyRuleActive
    ? familyBranch === 'children'
      ? event.maxCompanionsWithChildren!
      : event.maxCompanionsPerRegistration
    : event.maxCompanionsPerRegistration
  const showChildren = event.allowChildren && (!familyRuleActive || familyBranch === 'children')
  const showCompanions = event.allowCompanions && (!familyRuleActive || familyBranch !== null)
  // «Ospite» ha sostituito «Accompagnatore» ovunque nella UI (issue #36). Il
  // committente scrive «accompagnatore» nei suoi testi ma anche «i tuoi
  // ospiti»: il titolo della sezione è suo, la categoria resta quella del
  // dominio — sui biglietti, nell'export e allo scanner si legge «Ospite 1».
  const companionsNamePlaceholder = "Nome dell'ospite"
  const familyBranchMissing = familyRuleActive && familyBranch === null

  const isMember = user?.role === 'member'
  const lockedContactEmail = isMember ? (user.email ?? '') : ''
  const contactEmailLocked = lockedContactEmail.length > 0
  const eventUrl = `/eventi/${event.id}`
  const redirectPath = pathname || eventUrl
  const userName = watch('userName')

  const personsNeeded = 1 + childrenArray.fields.length + companionsArray.fields.length

  // Attività ad accesso libero (ADR 0011): niente tendina, una domanda sola.
  // Le due liste non si mescolano mai, perché non si scelgono allo stesso modo.
  const scheduledActivities = event.activities.filter((a) => !a.freeAccess)
  const freeAccessActivities = event.activities.filter((a) => a.freeAccess)
  const freeAccessIds = new Set(freeAccessActivities.map((a) => a.id))
  // La risposta è obbligatoria: facoltativa è la visita, non la risposta.
  // «Non ancora risposto» è l'assenza di chiave, «no» è NONE — la stessa
  // distinzione che una casella non saprebbe fare.
  const freeAccessUnanswered = freeAccessActivities.some((a) => !slotByActivity[a.id])

  useEffect(() => {
    if (!isMember) return
    if (lockedContactEmail) {
      setValue('contactEmail', lockedContactEmail, { shouldValidate: true })
    }
    if (!user.name || userName.trim() !== '') return
    setValue('userName', user.name)
  }, [isMember, lockedContactEmail, setValue, user?.name, userName])

  const slotById = useMemo(() => {
    const map = new Map<string, SlotWithAvailability>()
    for (const activity of event.activities) {
      for (const slot of activity.slots) map.set(slot.id, slot)
    }
    return map
  }, [event.activities])

  function setSlot(activityId: string, slotId: string) {
    setSlotByActivity((prev) => ({ ...prev, [activityId]: slotId }))
  }

  function buildSelections() {
    return event.activities
      .map((a) => ({ activityId: a.id, slotId: slotByActivity[a.id] ?? '' }))
      .filter((s) => s.slotId && s.slotId !== NONE)
  }

  function validateSelectionsClient(selections: { activityId: string; slotId: string }[]): string | null {
    // Senza Attività a fasce la policy non ha referente (ADR 0010), e le
    // Attività ad accesso libero ne restano fuori comunque (ADR 0011).
    // Stesse condizioni del server, stessi messaggi.
    const scheduled = selections.filter((s) => !freeAccessIds.has(s.activityId))
    if (scheduledActivities.length === 0) return null
    if (event.activityPolicy === 'all' && scheduled.length !== scheduledActivities.length) {
      return 'Devi selezionare uno slot per ogni attività'
    }
    if (event.activityPolicy === 'min' && scheduled.length < event.minActivities) {
      return `Devi selezionare almeno ${event.minActivities} attività`
    }
    if (event.activityPolicy === 'free' && scheduled.length === 0) {
      return 'Seleziona almeno un\u2019attività'
    }
    if (!event.allowOverlap) {
      const slots = scheduled.map((s) => slotById.get(s.slotId)!).filter(Boolean)
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          if (intervalsOverlap(slots[i].start, slots[i].end, slots[j].start, slots[j].end)) {
            return 'Hai selezionato slot che si sovrappongono nel tempo'
          }
        }
      }
    }
    return null
  }

  const onSubmit = handleSubmit(async (values) => {
    if (familyBranchMissing) {
      toast.error('Rispondi alla domanda sui figli minorenni prima di confermare')
      return
    }

    if (freeAccessUnanswered) {
      toast.error('Rispondi a tutte le domande prima di confermare')
      return
    }

    const selections = buildSelections()
    const selectionError = validateSelectionsClient(selections)
    if (selectionError) {
      toast.error(selectionError)
      return
    }

    setSubmitting(true)
    try {
      const result = await registerMutation({
        eventId: event.id as Id<'events'>,
        userName: values.userName,
        contactEmail: values.contactEmail,
        userAllergies: values.userAllergies,
        children: values.children ?? [],
        companions: values.companions ?? [],
        selections: selections.map((s) => ({
          activityId: s.activityId as Id<'activities'>,
          slotId: s.slotId as Id<'slots'>,
        })),
        privacyAccepted: values.privacyAccepted,
        embed,
      })

      const registeredPersons: RegisteredPerson[] = await Promise.all(
        result.persons.map(async (p): Promise<RegisteredPerson> => ({
          name: p.name,
          category: p.category,
          age: p.age,
          allergies: p.allergies,
          ticketCode: p.ticketCode,
          qrDataUrl: await generateQrDataUrl(p.ticketCode),
        })),
      )

      setTickets(registeredPersons)
      setRegistrationId(result.registrationId)
      setConfirmedEmail(result.contactEmail)
      toast.success('Registrazione completata')

      // Qui non parte più nessuna email. L'invio è un lavoro del server
      // (ADR 0015): `register` ha già aperto la Consegna e pianificato l'action
      // nella propria transazione, quindi non esiste più il caso «il browser
      // non è tornato e l'email non è mai partita». L'esito arriva a schermo
      // dal vivo, per iscrizione reattiva, dentro `TicketResult`.
    } catch (error) {
      toast.error(messageFromError(error, 'Registrazione non riuscita'))
    } finally {
      setSubmitting(false)
    }
  })

  const {
    register: registerDecline,
    handleSubmit: handleDeclineSubmit,
    control: declineControl,
    setValue: setDeclineValue,
    watch: watchDecline,
    formState: { errors: declineErrors },
  } = useForm<DeclineInput>({
    resolver: typedZodResolver(makeDeclineSchema(requiresPrivacy)),
    defaultValues: { name: '', email: '', privacyAccepted: false },
  })

  // Come per la registrazione: per un Membro loggato la risposta vale per
  // l'email dell'account (il server la impone comunque), così «sì» e «no»
  // parlano sempre della stessa email.
  const declineName = watchDecline('name')
  useEffect(() => {
    if (!isMember) return
    if (lockedContactEmail) {
      setDeclineValue('email', lockedContactEmail, { shouldValidate: true })
    }
    if (!user.name || declineName.trim() !== '') return
    setDeclineValue('name', user.name)
  }, [isMember, lockedContactEmail, setDeclineValue, user?.name, declineName])

  const onDeclineSubmit = handleDeclineSubmit(async (values) => {
    setDecliningSubmitting(true)
    try {
      await declineMutation({
        eventId: event.id as Id<'events'>,
        name: values.name,
        email: values.email,
        privacyAccepted: values.privacyAccepted,
      })
      setDeclined(true)
    } catch (error) {
      toast.error(messageFromError(error, 'Invio non riuscito'))
    } finally {
      setDecliningSubmitting(false)
    }
  })

  if (tickets) {
    return (
      <TicketResult
        persons={tickets}
        event={{
          title: event.title,
          location: event.location,
          // Stesso fuso del render server-side (ADR 0015): il biglietto
          // scaricato e quello spedito devono leggersi identici, anche per chi
          // apre la pagina da un altro fuso.
          dateRange: formatDateRange(event.startsAt, event.endsAt, {
            timeZone: EVENT_TIME_ZONE,
          }),
          imageUrl: event.imageUrl,
        }}
        // Consegna dell'email di conferma (ADR 0016): l'Esito si iscrive
        // all'esito e lo vede arrivare dal vivo. L'indirizzo da confermare non
        // torna dal server — la query pubblica ritorna solo l'enum — ed è
        // quello che l'Utente ha appena digitato.
        registrationId={registrationId}
        contactEmail={confirmedEmail}
        // Esito della Prenotazione (ADR 0014): i testi sono dell'Evento e
        // valgono su ogni superficie; i due interruttori sono
        // dell'Incorporamento, quindi fuori dall'iframe non hanno effetto —
        // `embed` è l'unico posto in cui questa asimmetria si legge.
        resultTitle={event.resultTitle}
        resultBody={event.resultBody}
        resultClosing={event.resultClosing}
        showTickets={!embed || event.embedShowTickets}
        showNewRegistration={!embed || event.embedShowNewRegistration}
        onReset={() => {
          reset()
          setSlotByActivity({})
          setTickets(null)
          setParticipationAnswer(event.confirmParticipation ? null : 'yes')
          setDeclined(false)
          setFamilyBranch(null)
        }}
      />
    )
  }

  if (event.confirmParticipation && declined) {
    return (
      <RegistrationNotice
        title="Grazie per averci risposto"
        description="Abbiamo registrato che non parteciperai a questo evento."
      />
    )
  }

  if (event.confirmParticipation && participationAnswer === null) {
    return (
      <RegistrationNotice
        title="Confermi la partecipazione?"
        description="Facci sapere se parteciperai a questo evento, così possiamo organizzarlo al meglio."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => setParticipationAnswer('yes')}>
            Sì, parteciperò
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setParticipationAnswer('no')}
          >
            No, non parteciperò
          </Button>
        </div>
      </RegistrationNotice>
    )
  }

  if (event.confirmParticipation && participationAnswer === 'no') {
    return (
      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold tracking-tight">Non parteciperò</h2>
        <form onSubmit={onDeclineSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="declineName">Il tuo nome e cognome</Label>
            <Input
              id="declineName"
              {...registerDecline('name')}
              aria-invalid={!!declineErrors.name}
            />
            {declineErrors.name && (
              <p className="text-sm text-destructive">{declineErrors.name.message}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="declineEmail">Email</Label>
            <Input
              id="declineEmail"
              type="email"
              {...registerDecline('email')}
              readOnly={contactEmailLocked}
              aria-invalid={!!declineErrors.email}
              className={contactEmailLocked ? 'bg-muted' : undefined}
            />
            {declineErrors.email && (
              <p className="text-sm text-destructive">{declineErrors.email.message}</p>
            )}
            {contactEmailLocked && (
              <p className="text-sm text-muted-foreground">
                La risposta vale per l&apos;e-mail del tuo account Membro.
              </p>
            )}
          </div>
          {/* Anche il «no» raccoglie nome ed e-mail: nessuna porta di servizio
              dove i dati personali entrano senza consenso (ADR 0012). */}
          {requiresPrivacy && (
            <div className="flex items-start gap-3">
              <Controller
                control={declineControl}
                name="privacyAccepted"
                render={({ field }) => (
                  <Checkbox
                    id="declinePrivacyAccepted"
                    className="mt-0.5"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    aria-invalid={!!declineErrors.privacyAccepted}
                  />
                )}
              />
              <div className="grid gap-1">
                <Label htmlFor="declinePrivacyAccepted" className="font-normal text-pretty">
                  {privacyNotice}
                </Label>
                {declineErrors.privacyAccepted && (
                  <p className="text-sm text-destructive">
                    {declineErrors.privacyAccepted.message}
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setParticipationAnswer(null)}
            >
              Indietro
            </Button>
            <Button type="submit" className="flex-1" disabled={decliningSubmitting}>
              {decliningSubmitting ? 'Invio…' : 'Conferma non partecipazione'}
            </Button>
          </div>
        </form>
      </section>
    )
  }

  if (embed && event.requireAccount) {
    return (
      <RegistrationNotice
        title="Completa la registrazione dal sito principale"
        description="Questo evento richiede un account Membro verificato. Apri la pagina ufficiale dell'evento per accedere o registrarti prima di prenotare."
      >
        <Button nativeButton={false} className="w-full" render={<Link href={eventUrl} />}>
          Vai al sito principale
        </Button>
      </RegistrationNotice>
    )
  }

  if (event.requireAccount && isLoading) {
    return (
      <RegistrationNotice
        title="Verifica account in corso…"
        description="Controlliamo se hai già un account Membro verificato per questo evento."
      />
    )
  }

  if (event.requireAccount && !user) {
    return (
      <RegistrationNotice
        title="Accedi o registrati per prenotare"
        description="La prenotazione per questo evento è riservata ai Membri con account verificato."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            nativeButton={false}
            className="flex-1"
            render={<Link href={`/accedi?redirect=${encodeURIComponent(redirectPath)}`} />}
          >
            Accedi
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            className="flex-1"
            render={<Link href={`/registrati?redirect=${encodeURIComponent(redirectPath)}`} />}
          >
            Registrati
          </Button>
        </div>
      </RegistrationNotice>
    )
  }

  if (event.requireAccount && user?.role !== 'member') {
    return (
      <RegistrationNotice
        title="Prenotazione riservata ai Membri"
        description="Per questo evento serve un account Membro verificato. Accedi con un account Membro per continuare."
      />
    )
  }

  if (event.requireAccount && !user?.emailVerified) {
    return (
      <RegistrationNotice
        title="Verifica la tua email"
        description="Prima di prenotare questo evento devi verificare l'email del tuo account Membro."
      >
        <Button nativeButton={false} className="w-full" render={<Link href="/profilo" />}>
          Apri il profilo
        </Button>
      </RegistrationNotice>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Registrati all&apos;evento</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Compila i dati di chi parteciperà con te: bastano pochi minuti.
        </p>
      </div>
      {/* gap-8 tra le sezioni, gap-4 dentro una sezione: senza riquadri è
          questo scarto a dire dove finisce un gruppo e comincia il prossimo. */}
      <form onSubmit={onSubmit} className="flex flex-col gap-8" noValidate>
        <input type="hidden" {...register('eventId')} />

        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="userName">Il tuo nome e cognome</Label>
            <Input id="userName" {...register('userName')} aria-invalid={!!errors.userName} />
            {errors.userName && <p className="text-sm text-destructive">{errors.userName.message}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contactEmail">E-mail</Label>
            <Input
              id="contactEmail"
              type="email"
              {...register('contactEmail')}
              readOnly={contactEmailLocked}
              aria-invalid={!!errors.contactEmail}
              className={contactEmailLocked ? 'bg-muted' : undefined}
            />
            {errors.contactEmail && (
              <p className="text-sm text-destructive">{errors.contactEmail.message}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {contactEmailLocked
                ? "Qui riceverai la conferma con i QR code di ingresso: è l'e-mail del tuo account Membro."
                : 'Qui riceverai la conferma con i QR code di ingresso per te e i tuoi ospiti.'}
            </p>
          </div>
        </div>

        {collectAllergies && (
          <section>
            <h3 className="text-base font-semibold">Allergie e intolleranze (facoltativo)</h3>
            <p className="mt-1 text-sm text-muted-foreground">{ALLERGIES_PRIVACY_NOTICE}</p>
            <div className="mt-4 grid gap-2">
              <Label htmlFor="userAllergies" className="sr-only">
                Le tue allergie o intolleranze
              </Label>
              <Input
                id="userAllergies"
                placeholder="Es. lattosio, frutta a guscio, glutine…"
                {...register('userAllergies')}
                aria-invalid={!!errors.userAllergies}
              />
              {errors.userAllergies && (
                <p className="text-sm text-destructive">{errors.userAllergies.message}</p>
              )}
            </div>
          </section>
        )}

        {familyRuleActive && (
          <section>
            {/* «Vieni con» e non «hai a carico»: la regola è applicata sul
                numero di Figli effettivamente inviati, quindi chi ne ha e
                viene solo deve poter rispondere di no. Il suggerimento sotto
                la domanda l'ha tolto il committente: spiegava il meccanismo
                del form invece di chiedere un dato. */}
            <h3 className="text-base font-semibold">Vieni con dei figli minorenni?</h3>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant={familyBranch === 'children' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => selectFamilyBranch('children')}
              >
                Sì, verrò con i miei figli
              </Button>
              <Button
                type="button"
                variant={familyBranch === 'no-children' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => selectFamilyBranch('no-children')}
              >
                No, nessun figlio
              </Button>
            </div>
          </section>
        )}

        {showChildren && (
          <PersonRepeater
            title="I tuoi figli"
            hint={
              event.maxChildrenPerRegistration === 1
                ? 'Puoi aggiungere un figlio minorenne: riceverà un proprio QR personale per l\u2019ingresso.'
                : `Puoi aggiungere fino a ${event.maxChildrenPerRegistration} figli minorenni: per ognuno riceverai un proprio QR personale per l\u2019ingresso.`
            }
            fields={childrenArray.fields}
            canAdd={childrenArray.fields.length < event.maxChildrenPerRegistration}
            onAdd={() => childrenArray.append({ name: '', age: 0, allergies: '' })}
            onRemove={childrenArray.remove}
            collectNames={collectNames}
            idPrefix="figlio"
            labelSingular="Figlio"
            renderExtra={(index) => (
              <div className="grid w-24 gap-2">
                <Label htmlFor={`child-age-${index}`} className="sr-only">
                  Età
                </Label>
                <Input
                  id={`child-age-${index}`}
                  type="number"
                  min={0}
                  max={17}
                  placeholder="Età"
                  {...register(`children.${index}.age` as const, { valueAsNumber: true })}
                />
              </div>
            )}
            register={(index) => register(`children.${index}.name` as const)}
            registerAllergies={
              collectAllergies
                ? (index) => register(`children.${index}.allergies` as const)
                : undefined
            }
            namePlaceholder="Nome del figlio"
          />
        )}

        {showCompanions && (
          <PersonRepeater
            title="Chi porti con te"
            hint={
              companionsMax === 1
                ? 'Puoi aggiungere un ospite adulto: riceverà un proprio QR personale per l\u2019ingresso. I figli maggiorenni contano come ospiti adulti.'
                : `Puoi aggiungere fino a ${plural(companionsMax, 'ospite adulto', 'ospiti adulti')}: ognuno riceverà un proprio QR personale per l\u2019ingresso. I figli maggiorenni contano come ospiti adulti.`
            }
            fields={companionsArray.fields}
            canAdd={companionsArray.fields.length < companionsMax}
            onAdd={() => companionsArray.append({ name: '', allergies: '' })}
            onRemove={companionsArray.remove}
            collectNames={collectNames}
            idPrefix="ospite"
            labelSingular="Ospite"
            register={(index) => register(`companions.${index}.name` as const)}
            registerAllergies={
              collectAllergies
                ? (index) => register(`companions.${index}.allergies` as const)
                : undefined
            }
            namePlaceholder={companionsNamePlaceholder}
          />
        )}

        {/* Selezione attività / slot. Una sezione vuota non si rende affatto
            (ADR 0010): senza Attività non c'è nulla da scegliere. Quando tutte
            le Attività sono ad accesso libero cade anche l'intestazione, e con
            essa il suggerimento di policy: non si applica a nessuna di loro
            (ADR 0011), e annunciarlo sarebbe una regola inventata. */}
        {scheduledActivities.length > 0 && (
          <section>
            <h3 className="text-base font-semibold">Attività</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {POLICY_HINT[event.activityPolicy](event.minActivities)} Lo slot scelto vale per{' '}
              {personsNeeded === 1
                ? 'te'
                : `tutte le ${personsNeeded} persone della prenotazione`}
              .
            </p>

            <div className="mt-4 flex flex-col gap-4">
              {scheduledActivities.map((activity) => {
                const selected = slotByActivity[activity.id] ?? ''
                const items = [
                  ...(event.activityPolicy !== 'all'
                    ? [{ value: NONE, label: 'Non partecipo' }]
                    : []),
                  ...activity.slots.map((slot) => ({
                    value: slot.id,
                    label: `${formatTimeRange(slot.start, slot.end)} · ${
                      slot.available !== null && slot.available < personsNeeded
                        ? 'posti insufficienti'
                        : `${slot.available} posti`
                    }`,
                  })),
                ]
                return (
                  <div key={activity.id} className="grid gap-2">
                    <Label htmlFor={`slot-${activity.id}`}>{activity.title}</Label>
                    <Select
                      items={items}
                      value={selected}
                      onValueChange={(value) => setSlot(activity.id, value ?? '')}
                    >
                      <SelectTrigger id={`slot-${activity.id}`} className="w-full">
                        <SelectValue placeholder="Seleziona una fascia oraria" />
                      </SelectTrigger>
                      <SelectContent>
                        {event.activityPolicy !== 'all' && (
                          <SelectItem value={NONE}>Non partecipo</SelectItem>
                        )}
                        {activity.slots.map((slot) => {
                          const disabled = slot.available !== null && slot.available < personsNeeded
                          return (
                            <SelectItem key={slot.id} value={slot.id} disabled={disabled}>
                              {formatTimeRange(slot.start, slot.end)} ·{' '}
                              {disabled ? 'posti insufficienti' : `${slot.available} posti`}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Attività ad accesso libero (ADR 0011): niente fasce, niente posti,
            una domanda sola — e nessun accenno alla capienza, perché non ne ha
            una. La risposta però è obbligatoria: facoltativa è la visita. */}
        {freeAccessActivities.map((activity) => {
          const answer = slotByActivity[activity.id]
          const openSlot = activity.slots[0]
          if (!openSlot) return null
          return (
            <section key={activity.id}>
              <h3 className="text-base font-semibold">{activity.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                Accesso libero dalle {formatTime(activity.start)} alle {formatTime(activity.end)}:
                puoi partecipare quando vuoi, senza prenotare una fascia oraria.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={answer === openSlot.id ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSlot(activity.id, openSlot.id)}
                >
                  Mi interessa
                </Button>
                <Button
                  type="button"
                  variant={answer === NONE ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSlot(activity.id, NONE)}
                >
                  Non mi interessa
                </Button>
              </div>
            </section>
          )
        })}

        {/* Consenso all'informativa (ADR 0012). Il testo è quello dell'Evento:
            quello che l'Utente spunta qui viene copiato sulla Prenotazione. */}
        {requiresPrivacy && (
          <section className="flex items-start gap-3">
            <Controller
              control={control}
              name="privacyAccepted"
              render={({ field }) => (
                <Checkbox
                  id="privacyAccepted"
                  className="mt-0.5"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  aria-invalid={!!errors.privacyAccepted}
                />
              )}
            />
            <div className="grid gap-1">
              <Label htmlFor="privacyAccepted" className="font-normal text-pretty">
                {privacyNotice}
              </Label>
              {errors.privacyAccepted && (
                <p className="text-sm text-destructive">{errors.privacyAccepted.message}</p>
              )}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            disabled={submitting || familyBranchMissing || freeAccessUnanswered}
            className="w-full"
          >
            {submitting
              ? 'Registrazione in corso…'
              : `Conferma registrazione (${plural(personsNeeded, 'persona', 'persone')})`}
          </Button>
          <p className="text-sm text-muted-foreground">
            Riceverai a breve un&apos;e-mail di conferma con i QR code di ingresso.
          </p>
        </div>
      </form>
    </section>
  )
}

function RegistrationNotice({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
      </div>
      {children}
    </section>
  )
}

interface PersonRepeaterProps {
  title: string
  hint: string
  fields: { id: string }[]
  canAdd: boolean
  onAdd: () => void
  onRemove: (index: number) => void
  register: (index: number) => ReturnType<ReturnType<typeof useForm<RegistrationInput>>['register']>
  /**
   * Allergie e intolleranze (issue #37): presente solo quando l'Evento le
   * chiede; assente = nessun campo allergie in questo blocco Persona.
   */
  registerAllergies?: (
    index: number,
  ) => ReturnType<ReturnType<typeof useForm<RegistrationInput>>['register']>
  namePlaceholder: string
  /**
   * Prefisso degli id dei campi. Separato dal titolo perché il titolo è copy
   * («Chi porti con te») e un id con gli spazi dentro non è un selettore.
   */
  idPrefix: string
  /** Raccolta nomi: se false, ogni blocco è intestato dall'Etichetta posizionale invece del nome. */
  collectNames: boolean
  /** Prefisso dell'Etichetta posizionale («Figlio», «Ospite») usato quando i nomi non sono raccolti. */
  labelSingular: string
  renderExtra?: (index: number) => React.ReactNode
}

function PersonRepeater({
  title,
  hint,
  fields,
  canAdd,
  onAdd,
  onRemove,
  register,
  registerAllergies,
  namePlaceholder,
  idPrefix,
  collectNames,
  labelSingular,
  renderExtra,
}: PersonRepeaterProps) {
  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          {/* Allergie e intolleranze (issue #37): l'informativa completa sui dati
              sanitari è nel blocco dell'Iscritto; qui basta il richiamo, perché i
              campi di questo blocco sono lontani dal testo esteso. */}
          {registerAllergies && (
            <p className="mt-1 text-sm text-muted-foreground">
              Le allergie sono facoltative e trattate come indicato sopra.
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Aggiungi
        </Button>
      </div>

      {/* Senza riquadri, a separare una Persona dalla successiva sono
          l'Etichetta posizionale che le fa da intestazione e il doppio dello
          spazio rispetto a quello tra i campi della stessa Persona. */}
      <div className="mt-4 flex flex-col gap-6">
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {labelSingular} {index + 1}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(index)}
                aria-label={`Rimuovi ${labelSingular} ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {(collectNames || renderExtra) && (
              <div className="flex items-start gap-3">
                {collectNames && (
                  <div className="grid flex-1 gap-2">
                    <Label htmlFor={`${idPrefix}-name-${index}`} className="sr-only">
                      {namePlaceholder}
                    </Label>
                    <Input
                      id={`${idPrefix}-name-${index}`}
                      placeholder={namePlaceholder}
                      {...register(index)}
                    />
                  </div>
                )}
                {renderExtra?.(index)}
              </div>
            )}
            {/* Allergie e intolleranze (issue #37): facoltative, vuoto = nessuna dichiarazione. */}
            {registerAllergies && (
              <div className="grid gap-2">
                <Label htmlFor={`${idPrefix}-allergies-${index}`} className="sr-only">
                  Allergie o intolleranze di {labelSingular} {index + 1}
                </Label>
                <Input
                  id={`${idPrefix}-allergies-${index}`}
                  placeholder="Allergie o intolleranze (facoltativo)"
                  {...registerAllergies(index)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
