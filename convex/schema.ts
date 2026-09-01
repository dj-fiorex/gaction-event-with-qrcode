import { defineSchema, defineTable } from 'convex/server'
import { authTables } from '@convex-dev/auth/server'
import { v } from 'convex/values'

/**
 * Enum di dominio riusati da schema e validatori delle functions.
 * Allineati a CONTEXT.md e all'originale lib/types.ts.
 */
export const activityPolicy = v.union(
  v.literal('all'),
  v.literal('min'),
  v.literal('free'),
)

export const checkInAccess = v.union(v.literal('private'), v.literal('password'))

export const personCategory = v.union(
  v.literal('user'),
  v.literal('child'),
  v.literal('companion'),
)

export const userRole = v.union(v.literal('admin'), v.literal('staff'), v.literal('member'))

/**
 * Stack tipografici dell'Aspetto dell'Incorporamento (ADR 0013). Enum e non
 * stringa CSS libera: le chiavi sono quelle di `EMBED_FONT_STACKS` in
 * `lib/embed.ts`, che ne tiene i valori.
 */
export const embedFontStack = v.union(
  v.literal('system'),
  v.literal('helvetica'),
  v.literal('georgia'),
  v.literal('times'),
  v.literal('mono'),
)

/**
 * Esiti della Consegna dell'email di conferma (ADR 0016). I valori sono quelli
 * di `DeliveryOutcome` in `lib/email-delivery.ts`, che ne tiene le regole:
 * `rifiutata` (il provider ha detto no) non è `non riuscita` (non siamo
 * riusciti nemmeno a chiedere), perché chiedono rimedi diversi.
 */
export const emailDeliveryOutcome = v.union(
  v.literal('pending'),
  v.literal('delivered'),
  v.literal('rejected'),
  v.literal('failed'),
  v.literal('simulated'),
)

export default defineSchema({
  // Tabelle di Convex Auth (users, authSessions, authAccounts, ...).
  ...authTables,

  // Estende la tabella `users` con i campi applicativi.
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    image: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    /** Ruolo applicativo. Assente = staff per i documenti legacy senza ruolo. */
    role: v.optional(userRole),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  events: defineTable({
    title: v.string(),
    description: v.string(),
    location: v.string(),
    /** Immagine di copertina opzionale (16:9). Byte su Convex file storage. */
    imageStorageId: v.optional(v.id('_storage')),
    /**
     * Date proprie dell'Evento (issue #45, ADR 0009). Assenti = comportamento
     * odierno: la data si deriva dalle Attività (primo inizio, ultima fine).
     * La dichiarazione vince sempre sulla derivazione, anche quando l'Evento
     * ha Attività. Inizio e fine sono indipendenti: la fine richiede l'inizio
     * ed è successiva, ma l'inizio sta in piedi da solo — l'ora di fine di una
     * cena nessuno la sa, e un orario inventato finirebbe sul biglietto.
     */
    startsAt: v.optional(v.string()),
    endsAt: v.optional(v.string()),
    activityPolicy,
    minActivities: v.number(),
    allowOverlap: v.boolean(),
    checkInToleranceMinutes: v.number(),
    allowQrReuse: v.boolean(),
    allowChildren: v.boolean(),
    maxChildrenPerRegistration: v.number(),
    allowCompanions: v.boolean(),
    maxCompanionsPerRegistration: v.number(),
    /**
     * Regola del nucleo familiare (issue #35): se presente, con almeno un
     * Figlio nella Prenotazione il cap Ospiti si riduce a questo valore
     * invece di maxCompanionsPerRegistration. Assente = comportamento
     * odierno (cap indipendenti, nessuna domanda sì/no nel form).
     */
    maxCompanionsWithChildren: v.optional(v.number()),
    checkInAccess,
    scanToken: v.string(),
    /** Hash SHA-256 della password di check-in (solo modalità password). */
    checkInPasswordHash: v.union(v.string(), v.null()),
    /** Token opaco restituito dopo l'unlock via password. Ruota col cambio password. */
    scanUnlockToken: v.union(v.string(), v.null()),
    /** Abilita l'incorporamento del form di registrazione su siti terzi via iframe. */
    embedEnabled: v.optional(v.boolean()),
    /** Se true, la Prenotazione richiede un Membro autenticato. */
    requireAccount: v.optional(v.boolean()),
    /** Se true, il form pubblico chiede prima «Confermi la partecipazione? sì/no». */
    confirmParticipation: v.optional(v.boolean()),
    /**
     * Raccolta nomi (issue #36): se true o assente, il form chiede il nome di
     * ogni Figlio/Ospite (comportamento odierno). Se false, Figli e Ospiti sono
     * identificati solo dall'Etichetta posizionale generata server-side
     * («Figlio 1», «Ospite 1»); i nomi inviati dal client vengono ignorati.
     */
    collectNames: v.optional(v.boolean()),
    /**
     * Allergie e intolleranze (issue #37): se true, il form chiede a ogni
     * Persona una dichiarazione facoltativa in testo libero. Assente o false =
     * nessun campo nel form e nessuna dichiarazione persistita.
     */
    collectAllergies: v.optional(v.boolean()),
    /**
     * Registrazione dell'uscita (issue #38): se true, lo scanner offre la
     * modalità «Uscita» come terzo momento di Check-in. Assente o false =
     * nessuna modalità Uscita (comportamento odierno).
     */
    recordExit: v.optional(v.boolean()),
    /**
     * Testo dell'email di conferma (issue #42): oggetto in chiaro e corpo in
     * markdown, componibili per Evento. Assenti o vuoti = comportamento
     * odierno (oggetto «Ticket per {title}» e corpo generato dal codice),
     * quindi nessun backfill per gli Eventi esistenti. L'oggetto è un campo a
     * sé e non una chiave del frontmatter: un'indentazione sbagliata non deve
     * poter togliere in silenzio l'oggetto a un'email che parte comunque.
     */
    emailSubject: v.optional(v.string()),
    emailBody: v.optional(v.string()),
    /**
     * Riepilogo della Prenotazione in coda all'email: assente o true = si
     * vede (comportamento odierno), quindi nessun backfill. false = l'email è
     * il solo Testo, i ticketCode viaggiano soltanto nel PDF allegato e le
     * allergie di quell'Evento restano leggibili solo in admin. È un
     * interruttore e non una rimozione perché il Riepilogo è l'unica
     * superficie che l'Utente riceve con le allergie: spegnerlo è una scelta
     * dell'Evento, non del prodotto.
     */
    emailShowSummary: v.optional(v.boolean()),
    /**
     * Esito della Prenotazione (ADR 0014): titolo, corpo e chiusura della
     * schermata mostrata dopo una Prenotazione riuscita. Testo semplice a
     * paragrafi, non markdown. Ripiego **indipendente per campo**: assenti o
     * vuoti valgono la formulazione odierna (la chiusura, che oggi non
     * esiste, vale l'assenza), quindi nessun backfill.
     *
     * Sono dell'Evento e non dell'Incorporamento: parlano al partecipante di
     * *quell'*evento, e si vedono su ogni superficie in cui la Prenotazione si
     * conclude — pagina pubblica e iframe.
     */
    resultTitle: v.optional(v.string()),
    resultBody: v.optional(v.string()),
    resultClosing: v.optional(v.string()),
    /**
     * Origini autorizzate a incorporare il form (CSP frame-ancestors).
     * Ogni voce è un'origine esatta (https://www.partner.com) o un wildcard di
     * sottodominio (https://*.partner.com). Vuoto = nessun sito autorizzato.
     */
    allowedOrigins: v.optional(v.array(v.string())),
    /**
     * Intestazione del form incorporato: Titolo e Luogo sono spegnibili
     * separatamente, perché il sito ospitante di solito li dice già lui e
     * ripeterli dentro l'iframe è rumore. Assenti o true = si vedono
     * (comportamento odierno), quindi nessun backfill: un default a false
     * spegnerebbe l'intestazione a ogni Evento già pubblicato. Nascondere è
     * solo visivo — il titolo resta come `<h1>` sr-only, altrimenti dentro
     * l'iframe non resterebbe nulla a dire a quale Evento ci si iscrive.
     */
    embedShowTitle: v.optional(v.boolean()),
    embedShowLocation: v.optional(v.boolean()),
    /**
     * Esito della Prenotazione dentro l'iframe: la griglia dei biglietti e il
     * bottone «Nuova registrazione» si spengono separatamente. Stesso verso
     * dei due qui sopra — assenti o true = si vedono — quindi nessun backfill.
     *
     * Spegnere i biglietti non toglie mai il bottone di download: con la
     * griglia via, quel PDF è l'unica presa che resta a chi non riceve
     * l'email. La forza dietro `embedShowTickets` è dell'iframe (quattro QR
     * fanno un riquadro alto ~2000px sulla pagina di qualcun altro); quella
     * dietro `embedShowNewRegistration` no — è «Una sola risposta per email»,
     * che rende quel bottone un vicolo cieco per un visitatore. Vive comunque
     * qui perché l'embed è la superficie rivolta al visitatore, mentre la
     * pagina pubblica è anche quella che l'organizzatore apre al banco.
     */
    embedShowTickets: v.optional(v.boolean()),
    embedShowNewRegistration: v.optional(v.boolean()),
    /**
     * Aspetto dell'Incorporamento (ADR 0013): i sei valori con cui il form
     * incorporato prende i colori del sito ospitante. Assente = aspetto
     * odierno, quindi nessun backfill per gli Eventi esistenti.
     *
     * O tutti e sei o nessuno: un Aspetto parziale moltiplicherebbe gli stati
     * («esiste ma non dice niente») e renderebbe non calcolabile il contrasto
     * fra testo e sfondo, che è l'unica cosa che avvisiamo. Il pannello
     * prepopola i campi col default, quindi cambiare un solo colore resta una
     * sola modifica.
     */
    embedTheme: v.optional(
      v.object({
        accent: v.string(),
        foreground: v.string(),
        background: v.string(),
        fontStack: embedFontStack,
        textScale: v.number(),
        radius: v.number(),
      }),
    ),
    /**
     * Informativa privacy dell'Evento (ADR 0012). Assente o vuota = nessuna
     * casella nel form e nessun vincolo nelle mutation, quindi gli Eventi
     * esistenti non richiedono backfill. Modificabile in ogni momento: ciò che
     * è già stato accettato non cambia, perché la riga se ne porta una copia.
     */
    privacyNotice: v.optional(v.string()),
  }).index('by_scanToken', ['scanToken']),

  activities: defineTable({
    eventId: v.id('events'),
    title: v.string(),
    start: v.string(),
    end: v.string(),
    slotDurationMinutes: v.number(),
    capacityPerSlot: v.number(),
    /**
     * Attività ad accesso libero (ADR 0011): niente fasce e niente tetto. Un
     * solo Slot largo quanto l'Attività, con `capacity: null`. Assente o false
     * = Attività a fasce, comportamento odierno. Con il flag attivo
     * `slotDurationMinutes` e `capacityPerSlot` restano in tabella ma non
     * significano più nulla: l'admin non li compila e nessuno li legge.
     */
    freeAccess: v.optional(v.boolean()),
    /** Ordine di visualizzazione dentro l'Evento. */
    order: v.number(),
  }).index('by_event', ['eventId']),

  slots: defineTable({
    eventId: v.id('events'),
    activityId: v.id('activities'),
    start: v.string(),
    end: v.string(),
    /**
     * Posti dello Slot. `null` = nessun tetto, ed è il solo caso dell'unico
     * Slot di un'Attività ad accesso libero (ADR 0011). Union e non optional:
     * «senza tetto» è una scelta dichiarata, non un campo dimenticato.
     */
    capacity: v.union(v.number(), v.null()),
    order: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_activity', ['activityId']),

  registrations: defineTable({
    eventId: v.id('events'),
    contactEmail: v.string(),
    userId: v.optional(v.id('users')),
    /**
     * Copia del testo dell'informativa accettata (ADR 0012). Non esiste un
     * campo «ha acconsentito»: la riga non potrebbe esistere senza consenso,
     * e il quando lo dà `_creationTime`. Assente = l'Evento non aveva
     * informativa al momento della Prenotazione.
     */
    privacyNoticeAccepted: v.optional(v.string()),
  })
    .index('by_event', ['eventId'])
    .index('by_user', ['userId']),

  slotSelections: defineTable({
    registrationId: v.id('registrations'),
    eventId: v.id('events'),
    activityId: v.id('activities'),
    slotId: v.id('slots'),
  })
    .index('by_registration', ['registrationId'])
    .index('by_slot', ['slotId'])
    .index('by_event', ['eventId']),

  persons: defineTable({
    registrationId: v.id('registrations'),
    eventId: v.id('events'),
    /**
     * Nome e cognome in due campi (ADR 0017). Il nome c'è sempre: per l'Utente
     * è quello dichiarato, per Figli e Ospiti è o il nome dichiarato o
     * l'Etichetta posizionale generata dal server («Figlio 1», «Ospite 1»).
     *
     * Il cognome è **solo dell'Utente**: il form non lo chiede a Figli e
     * Ospiti, quindi assente non vuol dire «non ancora compilato», vuol dire
     * che non gli è mai stato chiesto.
     */
    firstName: v.string(),
    lastName: v.optional(v.string()),
    /**
     * Il nome è stato dichiarato da chi prenota, oppure generato dal server?
     * Sta sulla riga e non si rilegge da `event.collectNames`, che è
     * patchabile su Eventi con Prenotazioni già esistenti: leggerlo *oggi* per
     * interpretare un nome scritto *tre settimane fa* reinterpreterebbe il
     * passato — «Luca Rossi» stampato come se fosse un'etichetta, o «Ospite 1»
     * presentato come un nome. Con il flag sulla riga il caso non è più
     * esprimibile. È il cuore dell'ADR 0017.
     */
    nameProvided: v.boolean(),
    category: personCategory,
    age: v.union(v.number(), v.null()),
    /**
     * Allergie e intolleranze dichiarate (issue #37). Dato sanitario: assente =
     * nessuna dichiarazione. Optional in stile widen: le righe già esistenti
     * non richiedono backfill.
     */
    allergies: v.optional(v.string()),
    ticketCode: v.string(),
    eventCheckInAt: v.union(v.string(), v.null()),
    eventCheckInCount: v.number(),
    eventCheckInLastAt: v.union(v.string(), v.null()),
    /**
     * Uscita dall'Evento (issue #38). Speculari ai campi d'ingresso ma
     * opzionali: assenti = mai uscito, così le righe esistenti non richiedono
     * backfill. Valorizzati solo dagli Eventi con `recordExit` attivo.
     */
    eventCheckOutAt: v.optional(v.string()),
    eventCheckOutCount: v.optional(v.number()),
    eventCheckOutLastAt: v.optional(v.string()),
  })
    .index('by_ticketCode', ['ticketCode'])
    .index('by_registration', ['registrationId'])
    .index('by_event', ['eventId']),

  activityCheckIns: defineTable({
    personId: v.id('persons'),
    eventId: v.id('events'),
    activityId: v.id('activities'),
    slotId: v.id('slots'),
    at: v.string(),
    count: v.number(),
    lastAt: v.string(),
  })
    .index('by_person', ['personId'])
    .index('by_person_activity', ['personId', 'activityId'])
    .index('by_slot', ['slotId']),

  // Associazione Assistente–Evento (modalità private).
  eventStaff: defineTable({
    eventId: v.id('events'),
    userId: v.id('users'),
  })
    .index('by_event', ['eventId'])
    .index('by_user', ['userId'])
    .index('by_event_user', ['eventId', 'userId']),

  /**
   * Consegna dell'email di conferma (ADR 0016): una riga per **tentativo**, non
   * per Prenotazione. Ogni Prenotazione ne apre una alla nascita e ogni Reinvio
   * ne apre un'altra, quindi la più recente è quella che conta.
   *
   * È una tabella e non un campo sulla Prenotazione per avere lo storico, che
   * si ripaga su un punto preciso: il Reinvio può **cambiare il destinatario**
   * salvato sulla Prenotazione, e un campo solo non saprebbe più dire a quale
   * indirizzo erano andate le email precedenti.
   *
   * Nessun backfill: le Prenotazioni anteriori non hanno righe, e l'assenza non
   * è un allarme (`deliveryNeedsAttention` in `lib/email-delivery.ts`).
   */
  emailDeliveries: defineTable({
    registrationId: v.id('registrations'),
    /**
     * Destinatario **effettivamente usato** per questo tentativo — congelato
     * qui, non riletto dalla Prenotazione al momento dell'invio. Senza, lo
     * storico non risponderebbe alla domanda per cui lo si è voluto.
     */
    recipient: v.string(),
    outcome: emailDeliveryOutcome,
    /**
     * Perché il tentativo non è andato a buon fine, in parole leggibili:
     * il rifiuto del provider, l'eccezione, o l'assenza di configurazione.
     * Assente sulle consegne riuscite, dove non c'è niente da spiegare.
     */
    reason: v.optional(v.string()),
    /**
     * ISO dell'istante in cui il tentativo si è chiuso. Assente = ancora in
     * corso. L'apertura non ha un campo suo: la dice `_creationTime`, ed è su
     * quella che la soglia in lettura misura un «in corso» stantio.
     */
    closedAt: v.optional(v.string()),
  }).index('by_registration', ['registrationId']),

  // Rinuncia (ADR 0004): risposta «no» a Conferma di partecipazione.
  // Non è una Prenotazione: nessuna Persona, nessun posto, nessun QR.
  declines: defineTable({
    eventId: v.id('events'),
    /**
     * Nome e cognome (ADR 0017), **entrambi obbligatori**: chi rinuncia
     * dichiara sempre il proprio nome, quindi qui non esiste né il caso del
     * nome generato né quello del cognome non chiesto — e infatti manca
     * `nameProvided`, che non avrebbe nulla da distinguere.
     */
    firstName: v.string(),
    lastName: v.string(),
    /** Normalizzata (trim + lowercase): solo dedup dentro l'Evento, mai identity linking. */
    email: v.string(),
    /** ISO dell'ultima risposta «no» (si aggiorna a ogni upsert). */
    respondedAt: v.string(),
    /** Copia dell'informativa accettata (ADR 0012). Anche la Rinuncia raccoglie dati personali. */
    privacyNoticeAccepted: v.optional(v.string()),
  })
    // Compound index: a query for "just eventId" is a valid prefix match,
    // so a separate by_event index would be redundant.
    .index('by_event_email', ['eventId', 'email']),
})
