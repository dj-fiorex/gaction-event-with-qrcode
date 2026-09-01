import { z } from 'zod'

import { RESULT_TITLE_MAX } from './result-content'

/* ------------------------------------------------------------------ */
/* Evento + Attività (creazione lato admin)                            */
/* ------------------------------------------------------------------ */

export const activityInputSchema = z
  .object({
    /**
     * Identità dell'Attività attraverso la modifica (ADR 0008): presente per
     * le Attività già persistite, assente per quelle appena aggiunte nel form.
     */
    id: z.string().optional(),
    title: z.string().trim().min(2, 'Inserisci il nome dell\u2019attività'),
    start: z.string().min(1, 'Inserisci l\u2019inizio'),
    end: z.string().min(1, 'Inserisci la fine'),
    slotDurationMinutes: z.coerce.number({ message: 'Durata non valida' }).int(),
    capacityPerSlot: z.coerce.number({ message: 'Capienza non valida' }).int(),
    /**
     * Attività ad accesso libero (ADR 0011): niente fasce, niente tetto. Con
     * il flag attivo Durata e capienza non vengono chieste all'admin, quindi
     * non vengono nemmeno validate — restano nel form ai loro default e
     * nessuno le legge.
     */
    freeAccess: z.boolean().default(false),
  })
  .refine((a) => new Date(a.end).getTime() > new Date(a.start).getTime(), {
    message: 'La fine deve essere successiva all\u2019inizio',
    path: ['end'],
  })
  .superRefine((a, ctx) => {
    if (a.freeAccess) return
    if (a.slotDurationMinutes < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La durata minima è 5 minuti',
        path: ['slotDurationMinutes'],
      })
    }
    if (a.capacityPerSlot < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Almeno 1 posto per slot',
        path: ['capacityPerSlot'],
      })
    }
  })

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, 'Titolo troppo corto'),
    description: z.string().trim().min(10, 'Descrizione troppo corta'),
    location: z.string().trim().min(2, 'Inserisci il luogo'),
    /** storageId Convex dell'immagine di copertina (opzionale). */
    imageStorageId: z.string().optional(),
    /**
     * Date proprie dell'Evento (ADR 0009), come valori `datetime-local`.
     * Vuote = non dichiarate, cioè derivate dalle Attività.
     */
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    activityPolicy: z.enum(['all', 'min', 'free']),
    minActivities: z.coerce.number().int().min(0).default(0),
    allowOverlap: z.boolean().default(false),
    checkInToleranceMinutes: z.coerce
      .number({ message: 'Tolleranza non valida' })
      .int()
      .min(0)
      .default(15),
    allowQrReuse: z.boolean().default(false),
    requireAccount: z.boolean().default(false),
    confirmParticipation: z.boolean().default(false),
    /** Raccolta nomi (issue #36): attiva di default (comportamento odierno). */
    collectNames: z.boolean().default(true),
    /** Allergie e intolleranze (issue #37): disattiva di default (comportamento odierno). */
    collectAllergies: z.boolean().default(false),
    /** Registrazione dell'uscita (issue #38): disattiva di default. */
    recordExit: z.boolean().default(false),
    /** Informativa privacy (ADR 0012). Vuota = nessuna casella nel form pubblico. */
    privacyNotice: z.string().default(''),
    /**
     * Testo dell'email di conferma (issue #42): oggetto in chiaro e corpo in
     * markdown. Vuoti = ripiego sul testo odierno, nessun backfill.
     */
    emailSubject: z.string().trim().max(200, 'Oggetto troppo lungo').optional(),
    emailBody: z.string().optional(),
    /** Riepilogo della Prenotazione in coda all'email: attivo di default (comportamento odierno). */
    emailShowSummary: z.boolean().default(true),
    /**
     * Intestazione del Biglietto: titolo di default (comportamento odierno).
     * Scegliere `image` senza aver caricato un'Immagine non è un errore da
     * bloccare qui — il biglietto ripiega sul titolo, e l'immagine può
     * arrivare dopo, in un secondo salvataggio.
     */
    ticketHeader: z.enum(['title', 'image']).default('title'),
    /**
     * Esito della Prenotazione (ADR 0014): testo semplice a paragrafi. Vuoti =
     * ripiego sul testo odierno, campo per campo. Il titolo ha un tetto più
     * basso dell'oggetto dell'email perché è un `h2` dentro un iframe stretto:
     * una riga che non ci sta non è un testo lungo, è un titolo sbagliato.
     */
    resultTitle: z
      .string()
      .trim()
      .max(RESULT_TITLE_MAX, `Massimo ${RESULT_TITLE_MAX} caratteri`)
      .optional(),
    resultBody: z.string().optional(),
    resultClosing: z.string().optional(),
    allowChildren: z.boolean().default(false),
    maxChildrenPerRegistration: z.coerce.number().int().min(0).default(0),
    allowCompanions: z.boolean().default(false),
    maxCompanionsPerRegistration: z.coerce.number().int().min(0).default(0),
    /** Regola del nucleo familiare: assente = cap Ospiti indipendente da oggi. */
    maxCompanionsWithChildren: z.coerce.number().int().min(0).optional(),
    checkInAccess: z.enum(['private', 'password']).default('private'),
    /**
     * Password di check-in. Stringa vuota = "mantieni quella corrente" (in
     * modifica) oppure "nessuna" (in creazione). Se valorizzata, min 4 caratteri.
     */
    checkInPassword: z
      .string()
      .trim()
      .min(4, 'La password deve avere almeno 4 caratteri')
      .optional()
      .or(z.literal('')),
    /**
     * Nessun minimo (ADR 0010): un Evento può non avere Attività, ed è una sua
     * forma legittima e permanente. La lista vuota è il modo in cui l'admin lo
     * dice — non esiste un interruttore che possa contraddirla.
     */
    activities: z.array(activityInputSchema),
  })
  .refine(
    (e) =>
      e.activities.length === 0 ||
      e.activityPolicy !== 'min' ||
      (e.minActivities >= 1 && e.minActivities <= e.activities.length),
    {
      message: 'Il minimo di attività deve essere tra 1 e il numero di attività',
      path: ['minActivities'],
    },
  )
  .refine(
    (e) =>
      !e.allowChildren ||
      !e.allowCompanions ||
      e.maxCompanionsWithChildren === undefined ||
      e.maxCompanionsWithChildren <= e.maxCompanionsPerRegistration,
    {
      message: 'Il massimo Ospiti con Figli non può superare il massimo Ospiti',
      path: ['maxCompanionsWithChildren'],
    },
  )
  // Date proprie dell'Evento (ADR 0009): la fine richiede l'inizio ed è
  // successiva, l'inizio sta in piedi da solo. Stesse due regole e stessi
  // messaggi di `validateEventInput` in convex/events.ts, che è chi decide.
  .refine((e) => !e.endsAt?.trim() || !!e.startsAt?.trim(), {
    message: 'Per dichiarare la fine dell\u2019evento serve anche l\u2019inizio',
    path: ['endsAt'],
  })
  .refine(
    (e) =>
      !e.startsAt?.trim() ||
      !e.endsAt?.trim() ||
      new Date(e.endsAt).getTime() > new Date(e.startsAt).getTime(),
    {
      message: 'La fine dell\u2019evento deve essere successiva all\u2019inizio',
      path: ['endsAt'],
    },
  )

export type ActivityInput = z.infer<typeof activityInputSchema>
export type EventInput = z.infer<typeof eventSchema>

/* ------------------------------------------------------------------ */
/* Registrazione (lato pubblico)                                       */
/* ------------------------------------------------------------------ */

/**
 * Allergie e intolleranze (issue #37): dichiarazione libera e facoltativa resa
 * per ogni Persona. Vuota = nessuna allergia dichiarata.
 */
export const allergiesInputSchema = z.string().trim().max(300, 'Massimo 300 caratteri').optional()

export const childInputSchema = z.object({
  /** Solo il nome: il cognome non si chiede a Figli e Ospiti (ADR 0017). */
  firstName: z.string().trim().min(2, 'Inserisci il nome del bambino'),
  allergies: allergiesInputSchema,
  /**
   * Età del Figlio. Nel form nasce **vuota**: non esiste un valore
   * precompilato che passi la validazione senza che nessuno l'abbia scelto.
   *
   * Il vuoto va respinto in tutte e due le forme in cui può arrivare: `NaN`
   * se il campo è registrato con `valueAsNumber` (come fa il form), stringa
   * vuota altrimenti. Senza il preprocess, `z.coerce.number()` convertirebbe
   * la stringa vuota in 0 — un'età valida, accettata in silenzio, che è
   * esattamente il difetto che questo campo ha smesso di avere.
   */
  age: z.preprocess(
    (value) => (value === '' ? Number.NaN : value),
    z.coerce
      .number({ message: 'Inserisci l\u2019età del figlio' })
      .int('L\u2019età deve essere un numero intero')
      .min(0, 'Età non valida')
      .max(17, 'L\u2019età deve essere inferiore a 18'),
  ),
})

export const companionInputSchema = z.object({
  firstName: z.string().trim().min(2, 'Inserisci il nome dell\u2019ospite'),
  allergies: allergiesInputSchema,
})

export const slotSelectionSchema = z.object({
  activityId: z.string().min(1),
  slotId: z.string().min(1),
})

export const registrationSchema = z.object({
  eventId: z.string().min(1),
  /**
   * Nome e cognome in due campi (ADR 0017), con un messaggio per campo: un solo
   * «Inserisci nome e cognome» sotto due caselle non direbbe quale delle due
   * manca.
   */
  userFirstName: z.string().trim().min(2, 'Inserisci il tuo nome'),
  userLastName: z.string().trim().min(2, 'Inserisci il tuo cognome'),
  contactEmail: z.string().trim().email('Inserisci un\u2019email valida'),
  userAllergies: allergiesInputSchema,
  children: z.array(childInputSchema).default([]),
  companions: z.array(companionInputSchema).default([]),
  selections: z.array(slotSelectionSchema).default([]),
  /**
   * Consenso all'informativa (ADR 0012). Qui è facoltativo perché lo schema
   * non sa se l'Evento ha un'informativa: lo impone
   * `makeRegistrationSchema(collectNames, requirePrivacy)`, e in ultima
   * istanza la mutation, che è il solo punto che conta.
   */
  privacyAccepted: z.boolean().default(false),
})

export type ChildInput = z.infer<typeof childInputSchema>
export type CompanionInput = z.infer<typeof companionInputSchema>
export type RegistrationInput = z.infer<typeof registrationSchema>

/**
 * I valori come vivono **dentro** il form, prima della validazione: l'età di un
 * Figlio può non esserci ancora, perché la casella nasce vuota. `RegistrationInput`
 * resta il tipo dell'output validato, quello che riceve `handleSubmit`.
 */
export type RegistrationFormValues = Omit<RegistrationInput, 'children'> & {
  children: (Omit<ChildInput, 'age'> & { age: number | undefined })[]
}

/**
 * Schema di registrazione parametrico sulla «Raccolta nomi» (issue #36).
 * Attiva (default): comportamento odierno, nome di Figli/Ospiti obbligatorio.
 * Disattiva: il form non raccoglie i nomi di Figli/Ospiti — il server genera
 * l'Etichetta posizionale e ignora comunque i nomi inviati — quindi la
 * validazione client non li impone. L'età dei Figli resta obbligatoria.
 */
/** Nome non validato: usato quando la Raccolta nomi è disattiva. */
const looseName = z.string().trim()

/**
 * Consenso all'informativa (ADR 0012) quando l'Evento ne ha una: senza spunta
 * il form non parte. Il rifiuto che conta resta però quello della mutation —
 * questo evita solo un viaggio inutile al server.
 */
const privacyAcceptedSchema = z.literal(true, {
  message: 'Per proseguire devi accettare l\u2019informativa',
})

export function makeRegistrationSchema(collectNames = true, requirePrivacy = false) {
  const base = collectNames
    ? registrationSchema
    : // Solo il vincolo sul nome cade: età e allergie restano quelle di base,
      // così i due schemi non possono divergere quando cambia la forma di una
      // Persona.
      registrationSchema.extend({
        children: z.array(childInputSchema.extend({ firstName: looseName })).default([]),
        companions: z.array(companionInputSchema.extend({ firstName: looseName })).default([]),
      })
  if (!requirePrivacy) return base
  return base.extend({ privacyAccepted: privacyAcceptedSchema })
}

/** Rinuncia (ADR 0004): risposta «no» a Conferma di partecipazione — solo nome ed email. */
export const declineSchema = z.object({
  /** Nome e cognome, entrambi obbligatori (ADR 0017): chi rinuncia dichiara sempre il proprio. */
  firstName: z.string().trim().min(2, 'Inserisci il tuo nome'),
  lastName: z.string().trim().min(2, 'Inserisci il tuo cognome'),
  email: z.string().trim().email('Inserisci un’email valida'),
  /** Consenso all'informativa (ADR 0012): anche il «no» raccoglie dati personali. */
  privacyAccepted: z.boolean().default(false),
})

export function makeDeclineSchema(requirePrivacy = false) {
  if (!requirePrivacy) return declineSchema
  return declineSchema.extend({ privacyAccepted: privacyAcceptedSchema })
}

export type DeclineInput = z.infer<typeof declineSchema>

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: z.string().trim().email('Email non valida'),
  password: z.string().min(1, 'Inserisci la password'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const staffAccountSchema = z.object({
  name: z.string().trim().min(2, 'Inserisci il nome'),
  email: z.string().trim().email('Email non valida'),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri'),
  role: z.enum(['admin', 'staff']),
})

export type StaffAccountInput = z.infer<typeof staffAccountSchema>
