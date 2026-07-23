# Context — Glossary

## Ubiquitous Language

### Utente
Chi si iscrive a un Evento e gestisce la prenotazione. Un Utente è **sempre anche una Persona**: partecipa, occupa un posto e riceve un proprio QR code. Può portare altre Persone (Figli e Ospiti). Un Utente **può ora essere collegato a un [[Membro]]** (account personale) quando prenota da loggato; resta comunque possibile prenotare in modo anonimo.

### Membro (Account personale)
Identità autenticata **persistente** che una persona crea sul sito per prenotare gli Eventi senza reinserire i propri dati e per consultare il proprio **Storico partecipazioni**. Tecnicamente è una riga della tabella `users` (Convex Auth) con **`role: 'member'`** — lo **stesso** contenitore di admin/Assistenti, ma **non privilegiato**. L'auto-registrazione è **email + password** con **email verificata obbligatoria**. Un Membro possiede le proprie Prenotazioni (via `registrations.userId`) e, quando prenota, compare all'Evento come Utente-Persona. **Attenzione al confine di nomi:** la tabella `users` NON coincide con il termine di glossario «Utente»; ospita tre attori (admin, staff/Assistente, member).

### Persona
Un partecipante fisico all'Evento. Occupa un posto e riceve **1 QR code**. NON è un account. Ha almeno un **nome**. Categorie di Persona:
- **Utente** — l'iscritto stesso (vedi sopra).
- **Figlio** — persona minorenne a carico portata dall'Utente, con **età** (e nome solo se l'Evento prevede la [[Raccolta nomi]]). Ammessi solo se l'admin lo consente per l'Evento, entro un massimo **per Prenotazione**.
- **Ospite** — persona adulta al seguito (nome solo con [[Raccolta nomi]] attiva). Ammessi solo se l'admin lo consente per l'Evento, entro un massimo **per Prenotazione**. _Evitare: Accompagnatore (termine storico, sostituito da Ospite nella UI e nei documenti)._

### Evento
Un raduno a cui gli Utenti si iscrivono. Genera **1 QR code per ogni Persona** (non per Attività). L'admin configura per ogni Evento se sono ammessi Figli (con max) e se sono ammessi Ospiti (con max).

### Immagine dell'Evento
Immagine **opzionale** di copertina dell'Evento, mostrata come hero nella pagina pubblica e come copertina nella `EventCard`, sempre in frame **16:9**. L'admin la carica ritagliandola client-side (react-easy-crop, aspect 16:9); i byte vivono su **Convex file storage** e sono referenziati da `imageStorageId` (`v.optional(v.id("_storage"))`). Il DTO risolve lo storageId in un URL esposto come `imageUrl` (`string | null`); quando assente si usa il fallback statico. Vedi ADR `0002`.

### Attività
Un segmento di un Evento con un **orario di inizio e fine** e una **Durata** (definita dall'admin). Dalla finestra inizio-fine e dalla Durata l'app **genera automaticamente gli Slot**. I posti limitati si contano per singolo Slot.

### Durata
Lunghezza in minuti di ogni Slot dell'Attività, impostata dall'admin. L'app divide la finestra inizio-fine dell'Attività in Slot consecutivi di questa Durata.

### Slot
Fascia oraria prenotabile all'interno di un'Attività, generata automaticamente dalla Durata. Ha un proprio inizio/fine e un **numero di posti limitato proprio**. Una Persona prenota uno Slot specifico; il check-in di Attività verifica che arrivi nel suo Slot.

### Tolleranza check-in
Margine in minuti, **configurabile dall'admin**, entro cui è consentito il check-in di uno Slot rispetto al suo orario. Fuori da questo margine il check-in è bloccato.

### Prenotazione
L'insieme delle Persone iscritte insieme da un Utente in un'unica operazione. La **selezione è unica per Prenotazione**: per ogni Attività scelta si seleziona **uno Slot specifico**, e tutte le Persone della Prenotazione occupano quello stesso Slot. Ogni Persona occupa 1 posto in ciascuno Slot selezionato.

### Allergie e intolleranze
Dichiarazione libera e facoltativa resa per **ogni Persona** della Prenotazione quando l'Evento la richiede (impostazione per-Evento). Campo vuoto = nessuna allergia dichiarata. È un dato sanitario: visibile ad admin, export, email di conferma e scanner per scelta esplicita del committente.

### Raccolta nomi
Impostazione a livello di Evento decisa dall'admin. Se attiva (default), il form chiede il nome di ogni Figlio e Ospite. Se disattiva, Figli e Ospiti sono identificati solo dall'[[Etichetta posizionale]] (più l'età per i Figli), per minimizzare i dati personali raccolti.

### Etichetta posizionale
Identificativo progressivo per categoria — «Figlio 1», «Figlio 2», «Ospite 1» — assegnato alle Persone di una Prenotazione quando l'Evento non prevede la [[Raccolta nomi]]. Compare ovunque comparirebbe il nome: email di conferma, biglietti, scanner, pannello admin, export.

### Conferma di partecipazione
Impostazione a livello di Evento decisa dall'admin. Se attiva, il form pubblico chiede per prima cosa «Confermi la partecipazione? sì/no»: il «sì» prosegue con la normale Prenotazione, il «no» registra una [[Rinuncia]]. Se disattiva, il form si comporta come oggi (chi non partecipa semplicemente non si iscrive).

### Regola del nucleo familiare
Impostazione opzionale a livello di Evento (numero «max Ospiti quando ci sono Figli», assente di default). Se assente, [[Figlio|Figli]] e [[Ospite|Ospiti]] restano indipendenti come oggi (ciascuno col proprio massimo per Prenotazione, nessuna domanda aggiuntiva). Se presente, il form chiede esplicitamente «Hai figli minorenni a carico? sì/no»: con «sì» mostra fino al massimo Figli (con età) più al massimo questo cap ridotto di Ospiti; con «no» mostra fino al massimo Ospiti pieno. La regola è applicata **server-side** nella mutation di registrazione in base al numero di Figli effettivamente inviati (mai fidandosi della risposta dichiarata dal client); il form la rispecchia solo per UX.

### Rinuncia
Risposta negativa («non partecipo») di una persona a un Evento che richiede la [[Conferma di partecipazione]]. Contiene solo nome e email. **Non è una Prenotazione**: non crea Persone, non occupa posti, non genera QR code. Al massimo una Rinuncia per email per Evento (una nuova risposta «no» la aggiorna). Una successiva Prenotazione con la stessa email cancella la Rinuncia; il percorso inverso è bloccato — chi è già iscritto non può rinunciare dal form pubblico ma deve contattare l'organizzatore (vedi [[Annullamento della Prenotazione]]).

### Annullamento della Prenotazione
Azione riservata all'admin che elimina un'intera Prenotazione: rimuove le sue Persone e selezioni, libera i posti negli Slot e invalida i relativi QR code. Non esiste un annullamento self-service dal form pubblico.

### Prenotazione riservata agli account (requireAccount)
Booleano a livello di Evento impostato dall'admin. Se **true**, per prenotare quell'Evento bisogna essere un [[Membro]] **loggato e con email verificata**; la Prenotazione viene collegata al Membro. Se **false**, la prenotazione anonima funziona come oggi (nome + `contactEmail`, senza login). Interazione con l'embed: quando un Evento è sia `requireAccount` sia `embedEnabled`, **per ora vince `requireAccount`** — il form incorporato rifiuta la prenotazione anonima e rimanda al sito principale. La coesistenza embed↔account va progettata in una sessione dedicata.

### Collegamento Prenotazione–Membro
Una Prenotazione è collegata a un Membro **solo tramite FK esplicita** (`registrations.userId`), impostata quando il Membro è loggato al momento della prenotazione (sempre per gli Eventi `requireAccount`; anche per gli Eventi anonimi se per caso è loggato). **Mai** per corrispondenza su `contactEmail`: quest'ultima è testo non verificato e un match esporrebbe la Prenotazione di uno sconosciuto (e i nomi dei suoi Figli) nello Storico di chi digita la stessa email. Le Prenotazioni anonime non compaiono in alcuno Storico.

### Storico partecipazioni
Vista nella [[Membro|area personale]] (`/profilo`): l'elenco degli Eventi che il Membro ha **prenotato** (via `registrations.userId`), ciascuno annotato con lo **stato di check-in reale** della sua Persona (presente/assente all'Evento, ed eventualmente a quali Attività/Slot). «Partecipazione» = Prenotazione **più** esito del [[Check-in]]; include quindi anche i no-show, marcati come tali.

### Permetti sovrapposizioni
Booleano a livello di Evento impostato dall'admin. Se falso, il sistema impedisce a una Prenotazione di selezionare Slot che si sovrappongono nel tempo. Se vero, gli Slot sovrapposti sono consentiti.

### Policy di selezione Attività
Impostazione a livello di Evento decisa dall'admin in fase di creazione. Determina come la Prenotazione viene associata alle Attività:
- **Tutte obbligatorie** — la Prenotazione include tutte le Attività.
- **Minimo N** — la Prenotazione deve includere almeno N Attività.
- **Libera** — l'Utente sceglie liberamente quali Attività includere in fase di Registrazione.

### Regola di capacità (atomica)
Una Registrazione è **atomica**: se anche un solo Slot selezionato non ha posti liberi sufficienti per **tutte** le Persone della Prenotazione, l'intera Registrazione fallisce. Nessuna iscrizione parziale, nessuna famiglia divisa.

### QR code
Un codice univoco generato **1 per ogni Persona** (non per Attività). Vale come pass per tutte le Attività a cui quella Persona è iscritta.

### Staff (Operatore / Assistente)
Ruolo dedicato alla scansione dei QR, separato dall'Admin, con accesso limitato alla sola interfaccia di scansione/check-in. Con Convex Auth ogni Operatore ha un **account reale** (email + password) e un campo `role`. Il campo `role` ha ora **tre valori** — `admin` | `staff` | `member` — dove `member` è il [[Membro]] pubblico non privilegiato (vedi ADR `0003`); admin e staff restano creabili **solo** da un admin. Sinonimo usato dall'admin per lo staff: **Assistente**.

### Modalità di accesso all'Evento (checkInAccess)
Impostazione a livello di Evento che determina chi può operare la scansione:
- **private** — accessibile solo agli account (admin, oppure Assistenti **esplicitamente associati** all'Evento) autenticati via Convex Auth. L'admin seleziona quali Assistenti abilitare.
- **password** — il link `/scan/[token]` è pubblico: chiunque abbia la password dell'Evento può operare, a prescindere dal login.

### Associazione Assistente–Evento
Per gli Eventi in modalità `private`, l'admin sceglie quali account Assistente sono abilitati a operare la scansione di quello specifico Evento. Un admin può sempre operare qualsiasi Evento.

### ticketCode (QR token)
Stringa opaca e univoca associata a ogni Persona (`TCK-...`), indicizzata in Convex (`by_ticketCode`), che rappresenta il contenuto del QR. Disaccoppiata dall'`_id` interno del documento; il lookup alla scansione avviene per indice, O(1). È al contempo il codice leggibile mostrato sul biglietto e il token scansionato.

### scanUnlockToken
Token opaco random per-Evento (solo modalità `password`). Restituito al client quando la password dell'Evento viene verificata con successo; il client lo conserva e lo invia con ogni check-in per provare l'autorizzazione, senza esporre l'hash della password. Ruota al cambio password.

### Esito check-in
Valore di ritorno delle mutation di check-in, mappato dalla UI sugli stati esistenti (`event-valid`, `event-already`, `activity-valid`, `activity-already`, `exit-valid`, `exit-already`, `exit-not-entered`, `exit-disabled`, `not-registered-activity`, `too-early`, `too-late`, `wrong-event`, `not-found`). Le mutation Convex sono transazionali: lo stato viene ri-letto dentro la transazione per evitare doppi check-in e overbooking.

### Check-in
Atto di scansionare il QR di una Persona. Avviene:
1. **All'ingresso dell'Evento** — validazione generale.
2. **All'ingresso di ogni Attività** — verifica che la Persona sia iscritta a quell'Attività e che stia arrivando nella fascia oraria corretta (arrivo troppo in anticipo/fuori orario = bloccato).
3. **All'uscita dall'Evento** — solo per gli Eventi con la [[Registrazione dell'uscita]] attiva; richiede un ingresso già registrato (uscita senza ingresso = bloccata).

### Registrazione dell'uscita
Impostazione a livello di Evento decisa dall'admin (`recordExit`, disattiva di default). Se attiva, lo scanner offre la modalità «Uscita», che registra l'orario di uscita della Persona dall'Evento in campi speculari a quelli d'ingresso (prima uscita, contatore, ultima uscita). Un'uscita senza ingresso registrato è **bloccata** («Non risulta entrato») e non scrive nulla, così una scansione nella modalità sbagliata non corrompe i dati. Le ri-uscite seguono la stessa regola dei rientri (riuso QR): riuso off → «già registrata»; riuso on → il contatore avanza e l'ultima uscita si aggiorna.
