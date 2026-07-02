# Context — Glossary

## Ubiquitous Language

### Utente
Chi si iscrive a un Evento e gestisce la prenotazione. Un Utente è **sempre anche una Persona**: partecipa, occupa un posto e riceve un proprio QR code. Può portare altre Persone (Figli e Accompagnatori).

### Persona
Un partecipante fisico all'Evento. Occupa un posto e riceve **1 QR code**. NON è un account. Ha almeno un **nome**. Categorie di Persona:
- **Utente** — l'iscritto stesso (vedi sopra).
- **Figlio** — persona a carico portata dall'Utente, con **nome + età**. Ammessi solo se l'admin lo consente per l'Evento, entro un massimo **per Prenotazione**.
- **Accompagnatore** — persona adulta al seguito, con **nome**. Ammessi solo se l'admin lo consente per l'Evento, entro un massimo **per Prenotazione**.

### Evento
Un raduno a cui gli Utenti si iscrivono. Genera **1 QR code per ogni Persona** (non per Attività). L'admin configura per ogni Evento se sono ammessi Figli (con max) e se sono ammessi Accompagnatori (con max).

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
Ruolo dedicato alla scansione dei QR, separato dall'Admin, con accesso limitato alla sola interfaccia di scansione/check-in. Con Convex Auth ogni Operatore ha un **account reale** (email + password) e un campo `role` (`admin` | `staff`). Sinonimo usato dall'admin: **Assistente**.

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
Valore di ritorno delle mutation di check-in, mappato dalla UI sugli stati esistenti (`event-valid`, `event-already`, `activity-valid`, `activity-already`, `not-registered-activity`, `too-early`, `too-late`, `wrong-event`, `not-found`). Le mutation Convex sono transazionali: lo stato viene ri-letto dentro la transazione per evitare doppi check-in e overbooking.

### Check-in
Atto di scansionare il QR di una Persona. Avviene:
1. **All'ingresso dell'Evento** — validazione generale.
2. **All'ingresso di ogni Attività** — verifica che la Persona sia iscritta a quell'Attività e che stia arrivando nella fascia oraria corretta (arrivo troppo in anticipo/fuori orario = bloccato).
