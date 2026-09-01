# Context — Glossary

## Ubiquitous Language

### Utente
Chi si iscrive a un Evento e gestisce la prenotazione. Un Utente è **sempre anche una Persona**: partecipa, occupa un posto e riceve un proprio QR code. Può portare altre Persone (Figli e Ospiti). Un Utente **può ora essere collegato a un [[Membro]]** (account personale) quando prenota da loggato; resta comunque possibile prenotare in modo anonimo.

### Membro (Account personale)
Identità autenticata **persistente** che una persona crea sul sito per prenotare gli Eventi senza reinserire i propri dati e per consultare il proprio **Storico partecipazioni**. Tecnicamente è una riga della tabella `users` (Convex Auth) con **`role: 'member'`** — lo **stesso** contenitore di admin/Assistenti, ma **non privilegiato**. L'auto-registrazione è **email + password** con **email verificata obbligatoria**. Un Membro possiede le proprie Prenotazioni (via `registrations.userId`) e, quando prenota, compare all'Evento come Utente-Persona. **Attenzione al confine di nomi:** la tabella `users` NON coincide con il termine di glossario «Utente»; ospita tre attori (admin, staff/Assistente, member).

### Persona
Un partecipante fisico all'Evento. Occupa un posto e riceve **1 QR code**. NON è un account. Ha sempre un **nome**, e — se è l'[[Utente]] — anche un **cognome in un campo suo**: sono due colonne distinte, non una stringa da spezzare a occhio (ADR `0017`). Figli e Ospiti il cognome non ce l'hanno, perché il form non glielo chiede: assente non vuol dire «non ancora compilato». Ogni Persona si porta inoltre se il nome l'ha **dichiarato chi prenota** o l'ha **generato il server** ([[Etichetta posizionale]]). Categorie di Persona:
- **Utente** — l'iscritto stesso (vedi sopra).
- **Figlio** — persona minorenne a carico portata dall'Utente, con **età** (e nome solo se l'Evento prevede la [[Raccolta nomi]]). Ammessi solo se l'admin lo consente per l'Evento, entro un massimo **per Prenotazione**.
- **Ospite** — persona adulta al seguito (nome solo con [[Raccolta nomi]] attiva). Ammessi solo se l'admin lo consente per l'Evento, entro un massimo **per Prenotazione**. _Evitare: Accompagnatore (termine storico, sostituito da Ospite nella UI e nei documenti)._

### Evento
Un raduno a cui gli Utenti si iscrivono. Genera **1 QR code per ogni Persona** (non per Attività). L'admin configura per ogni Evento se sono ammessi Figli (con max) e se sono ammessi Ospiti (con max). Le [[Attività]] sono **facoltative**: un Evento può non averne nessuna — una cena, un'assemblea, un open day — e allora non ha fasce orarie, non ha [[Policy di selezione Attività|policy di selezione]] e **non ha tetto di posti**, perché la capienza è un concetto dello [[Slot]]. Non è uno stato di bozza: un Evento senza Attività è pubblico e prenotabile come ogni altro (ADR `0010`).

### Immagine dell'Evento
Immagine **opzionale** di copertina dell'Evento, mostrata come hero nella pagina pubblica e come copertina nella `EventCard`, sempre in frame **16:9**. L'admin la carica ritagliandola client-side (react-easy-crop, aspect 16:9); i byte vivono su **Convex file storage** e sono referenziati da `imageStorageId` (`v.optional(v.id("_storage"))`). Il DTO risolve lo storageId in un URL esposto come `imageUrl` (`string | null`); quando assente si usa il fallback statico. Vedi ADR `0002`.

### Data dell'Evento
Quando l'Evento comincia ed eventualmente finisce. L'admin può **dichiararla** sull'Evento — inizio e fine indipendenti, la fine richiede l'inizio ed è successiva — e se non la dichiara si **deriva** dalle [[Attività]]: il primo inizio e l'ultima fine. La dichiarazione vince sempre sulla derivazione: un Evento può cominciare alle 20 con la prima Attività alle 21, e non è una contraddizione. Senza dichiarazione e senza Attività non c'è data: ovunque comparirebbe si legge «Data da definire», biglietto compreso. Vedi ADR `0009`.

### Attività
Un segmento **facoltativo** di un Evento con un **orario di inizio e fine** e una **Durata** (definita dall'admin). Dalla finestra inizio-fine e dalla Durata l'app **genera automaticamente gli Slot**. I posti limitati si contano per singolo Slot. Un'Attività può però essere ad [[Attività ad accesso libero|accesso libero]], e allora non ha né fasce né tetto. Un Evento può non avere Attività: vedi [[Evento]] ed [[Eliminazione di un'Attività]].

### Durata
Lunghezza in minuti di ogni Slot dell'Attività, impostata dall'admin. L'app divide la finestra inizio-fine dell'Attività in Slot consecutivi di questa Durata.

### Attività ad accesso libero
[[Attività]] a cui si partecipa quando si vuole, dentro la sua finestra oraria, senza prenotare una fascia e senza tetto di posti — una visita allo stabilimento aperta dalle 15 alle 17. L'admin la dichiara tale per Attività; Durata e capienza non gli vengono nemmeno chieste, perché non ci sono numeri da inventare. All'[[Utente]] il form non offre una tendina ma una domanda sola, «mi interessa / non mi interessa», **alla quale però deve rispondere**: facoltativa è la visita, non la risposta, e una casella lasciata vuota confonderebbe il «no» con il «non ho letto». È **esente** dalla [[Policy di selezione Attività]] e da [[Permetti sovrapposizioni]], perché una visita libera non occupa il tuo tempo, lo attraversa. Resta un'Attività a tutti gli effetti per il [[Check-in]]: il QR vale al suo ingresso e la [[Tolleranza check-in]] continua a proteggerne la finestra. Vedi ADR `0011`.

### Slot
Fascia oraria prenotabile all'interno di un'Attività, generata automaticamente dalla Durata. Ha un proprio inizio/fine e, di norma, un **numero di posti limitato proprio**; fa eccezione l'[[Attività ad accesso libero]], che ne ha uno solo, largo quanto sé stessa e **senza tetto**. Una Persona prenota uno Slot specifico; il check-in di Attività verifica che arrivi nel suo Slot.

### Tolleranza check-in
Margine in minuti, **configurabile dall'admin**, entro cui è consentito il check-in di uno Slot rispetto al suo orario. Fuori da questo margine il check-in è bloccato. Vale **solo** per il check-in di [[Attività]]: l'Ingresso e l'Uscita non hanno finestra oraria, quindi in un Evento senza Attività questa impostazione non ha effetto e non viene nemmeno chiesta.

### Prenotazione
L'insieme delle Persone iscritte insieme da un Utente in un'unica operazione. La **selezione è unica per Prenotazione**: per ogni Attività scelta si seleziona **uno Slot specifico**, e tutte le Persone della Prenotazione occupano quello stesso Slot. Ogni Persona occupa 1 posto in ciascuno Slot selezionato.

### Testo dell'email di conferma
Oggetto e corpo dell'email inviata dopo una [[Prenotazione]], **scritti dall'admin per ogni [[Evento]]**. L'oggetto è testo semplice; il corpo è **markdown**, composto nel form dell'Evento con l'anteprima resa a fianco dallo stesso motore che rende l'email in partenza — quel che l'admin scrive si vede quindi com'è, senza una seconda implementazione da tenere allineata. L'anteprima si ferma al corpo: il [[Riepilogo della Prenotazione]] si aggiunge all'invio, quando le Persone esistono. L'oggetto è un campo a sé e **non** una chiave del frontmatter del corpo: un'indentazione sbagliata non deve poter togliere in silenzio l'oggetto a un'email che parte comunque. Il corpo può contenere i [[Segnaposto]] del nome e cognome dell'Utente. Entrambi vuoti = **comportamento odierno** (oggetto «Ticket per {titolo}» e corpo generato dal codice), quindi nessun Evento esistente va aggiornato. L'email spedita è questo testo seguito dal [[Riepilogo della Prenotazione]] (ADR `0007`).

### Segnaposto
Le due parole che l'admin può scrivere nel [[Testo dell'email di conferma]] e che il server sostituisce, a ogni invio, con il **nome** e il **cognome** dell'[[Utente]] della [[Prenotazione]] — l'unica [[Persona]] che li ha sempre entrambi (ADR `0017`). L'insieme è **chiuso e minimo**: ogni Segnaposto in più è una promessa da mantenere per sempre, e i fatti dell'Evento (data, luogo, titolo) l'admin li scrive già nel Testo. Il valore sostituito entra **neutralizzato**, come il testo dell'Utente nel [[Riepilogo della Prenotazione]]: un nome con un asterisco resta un nome con un asterisco. L'anteprima nel form mostra il Segnaposto com'è scritto, perché lì non esiste ancora nessun Utente.

### Esito della Prenotazione
La schermata che l'[[Utente]] legge dopo una [[Prenotazione]] riuscita, sulla pagina pubblica come dentro l'[[Incorporamento]]. Ha tre testi **scritti dall'admin per ogni [[Evento]]** — titolo, corpo e chiusura — in testo semplice a paragrafi, non markdown: qui il bisogno è «vai a capo» più gli indirizzi cliccabili, non titoli ed elenchi come nel [[Testo dell'email di conferma]]. Ciascuno vuoto ripiega **per conto proprio** sul testo odierno, così scrivere la sola chiusura resta una sola modifica; la chiusura, che oggi non esiste, vuota non compare affatto. Il corpo di ripiego smette di indicare il PDF per Persona quando i biglietti non si vedono: promettere un bottone che non c'è sarebbe falso.

Il **bottone per scaricare i biglietti** non si spegne mai: tolta la griglia dei QR, quel PDF è l'unica presa di chi non riceve l'email. Griglia e «Nuova registrazione» si spengono invece dall'Incorporamento e solo lì — le parole sono dell'Evento, la visibilità è della superficie. Vedi ADR `0014`.

### Riepilogo della Prenotazione
Blocco **generato** che chiude l'email di conferma, sotto al [[Testo dell'email di conferma]]. Elenca, per ogni [[Persona]], l'[[Etichetta posizionale]] o il nome, l'età dove si applica, il [[ticketCode (QR token)|ticketCode]] e le [[Allergie e intolleranze]] dichiarate. È l'unica superficie che l'[[Utente]] riceve dove le allergie sono visibili — i biglietti PDF non le riportano, per non portare un dato sanitario sul foglio mostrato al varco — e per questo sopravvive alla rimozione dei blocchi QR dal corpo. Il testo dell'Utente (nomi, allergie) vi entra neutralizzato: non può diventare formattazione markdown né HTML. **Si spegne per Evento**: assente = si vede, come ogni altro interruttore; spento, l'email è il solo Testo e i ticketCode viaggiano soltanto nel PDF allegato — che non è più best-effort (ADR `0015`) — mentre le allergie di quell'Evento restano leggibili solo in admin. Nasce dalla richiesta del committente di un'email senza elenco in coda; l'interruttore, e non la rimozione, tiene in piedi la garanzia sulle allergie per gli altri Eventi.

### Consegna dell'email di conferma
Un tentativo di far arrivare all'[[Utente]] l'email di conferma di una [[Prenotazione]], con il **destinatario effettivamente usato** e il suo esito. Ogni Prenotazione ne apre una alla nascita; ogni [[Reinvio dell'email di conferma]] ne apre un'altra, quindi una Prenotazione può averne più d'una e la più recente è quella che conta. Gli esiti sono cinque: **in corso**, **consegnata**, **rifiutata** (con il motivo del provider), **non riuscita** (non siamo riusciti nemmeno a chiedere) e **simulata** (nessun provider configurato: normale in sviluppo, guasto totale in produzione). «Consegnata» significa **accettata dal provider**, non letta: oltre quel punto non abbiamo visibilità, e non fingiamo di averla. Nessun tentativo si ripete da sé — il rimedio è il Reinvio, che è dell'admin. Si cancella con la Prenotazione all'[[Annullamento della Prenotazione]]: porta un indirizzo email, e un indirizzo non sopravvive alla riga che lo giustificava. Vedi ADR `0016`.

### Allergie e intolleranze
Dichiarazione libera e facoltativa resa per **ogni Persona** della Prenotazione quando l'Evento la richiede (impostazione per-Evento). Campo vuoto = nessuna allergia dichiarata. È un dato sanitario: visibile ad admin, export, email di conferma e scanner per scelta esplicita del committente.

### Consenso all'informativa
Spunta che l'[[Utente]] deve dare per rispondere a un Evento, quando l'admin ha scritto un'informativa privacy per quell'Evento. Assente l'informativa, non c'è casella e non c'è vincolo. Il rifiuto vive **nella mutation**, non nel bottone disabilitato: le mutation pubbliche sono chiamabili senza passare dal form, e solo il rifiuto server-side rende vera l'implicazione «la riga esiste ⇒ il consenso c'è». Non esiste quindi un campo «ha acconsentito» — sarebbe ridondante, e il «quando» lo dà `_creationTime`. Esiste invece la **copia del testo accettato** sulla riga: un consenso è consenso a un testo preciso, e l'informativa dell'Evento è riscrivibile dall'admin, quindi senza copia una risposta di ottobre risulterebbe aver accettato le parole di novembre. Vale su entrambi i rami pubblici, [[Prenotazione]] e [[Rinuncia]]: non c'è una porta di servizio dove i dati personali entrano senza consenso. Vedi ADR `0012`.

### Raccolta nomi
Impostazione a livello di Evento decisa dall'admin. Se attiva (default), il form chiede il nome di ogni Figlio e Ospite. Se disattiva, Figli e Ospiti sono identificati solo dall'[[Etichetta posizionale]] (più l'età per i Figli), per minimizzare i dati personali raccolti. **Vale al momento della Prenotazione e solo lì:** l'impostazione è modificabile in ogni momento, ma ciò che è già stato raccolto non cambia significato — ogni [[Persona]] si ricorda sulla propria riga se il suo nome è dichiarato o generato (ADR `0017`).

### Etichetta posizionale
Identificativo progressivo per categoria — «Figlio 1», «Figlio 2», «Ospite 1» — che ogni Persona di una Prenotazione ha sempre, per la posizione che occupa nella lista della sua categoria. Nel form intesta il blocco di campi di quella Persona, che i nomi si raccolgano o no. Quando l'Evento non prevede la [[Raccolta nomi]] è **anche** l'identità con cui la Persona compare ovunque comparirebbe il nome: email di conferma, biglietti, scanner, pannello admin, export. In quel caso è **scritta nel nome della Persona**, e la riga si ricorda che è generata: cambiare la [[Raccolta nomi]] dopo una Prenotazione non reinterpreta chi si è già iscritto — né promuove un'etichetta a nome, né declassa un nome vero a etichetta (ADR `0017`).

### Conferma di partecipazione
Impostazione a livello di Evento decisa dall'admin. Se attiva, il form pubblico chiede per prima cosa «Confermi la partecipazione? sì/no»: il «sì» prosegue con la normale Prenotazione, il «no» registra una [[Rinuncia]]. Se disattiva, il form si comporta come oggi (chi non partecipa semplicemente non si iscrive).

### Regola del nucleo familiare
Impostazione opzionale a livello di Evento (numero «max Ospiti quando ci sono Figli», assente di default). Se assente, [[Figlio|Figli]] e [[Ospite|Ospiti]] restano indipendenti come oggi (ciascuno col proprio massimo per Prenotazione, nessuna domanda aggiuntiva). Se presente, il form chiede esplicitamente «Vieni con dei figli minorenni? sì/no» — non «hai figli a carico»: chi ne ha tre e viene da solo risponde no, ed è la risposta giusta, perché la regola è applicata sul numero di Figli effettivamente inviati: con «sì» mostra fino al massimo Figli (con età) più al massimo questo cap ridotto di Ospiti; con «no» mostra fino al massimo Ospiti pieno. La regola è applicata **server-side** nella mutation di registrazione in base al numero di Figli effettivamente inviati (mai fidandosi della risposta dichiarata dal client); il form la rispecchia solo per UX.

### Rinuncia
Risposta negativa («non partecipo») di una persona a un Evento che richiede la [[Conferma di partecipazione]]. Contiene solo nome, cognome ed email: sono dati personali, quindi anche qui vale il [[Consenso all'informativa]]. Nome e cognome sono due campi ed **entrambi obbligatori**, perché chi rinuncia dichiara sempre il proprio (ADR `0017`). **Non è una Prenotazione**: non crea Persone, non occupa posti, non genera QR code. Al massimo una Rinuncia per email per Evento. Per un [[Membro (Account personale)|Membro]] loggato vale l'email dell'account, non quella digitata (come per la Prenotazione). Vale la regola [[Una sola risposta per email]]: chi ha già risposto — in un senso o nell'altro — non può rispondere di nuovo dal form pubblico.

### Una sola risposta per email
Per ogni Evento, un'email (normalizzata trim + lowercase) può avere al massimo **una** risposta self-service: una Prenotazione **o** una [[Rinuncia]]. Qualsiasi invio successivo con la stessa email — nuovo «sì», nuovo «no», o cambio di risposta — è bloccato con l'invito a scrivere un'email all'organizzatore. Ogni modifica è un rimedio riservato all'admin: [[Annullamento della Prenotazione]] o [[Rimozione della Rinuncia]] (ADR 0005).

### Annullamento della Prenotazione
Azione riservata all'admin che elimina un'intera Prenotazione: rimuove le sue Persone e selezioni, libera i posti negli Slot e invalida i relativi QR code. Non esiste un annullamento self-service dal form pubblico.

### Rimozione della Rinuncia
Azione riservata all'admin che elimina una [[Rinuncia]]: l'email torna libera di prenotare l'Evento. È il rimedio operativo quando chi ha risposto «no» scrive all'organizzatore per cambiare idea (vedi [[Una sola risposta per email]]).

### Eliminazione di un'Attività
Azione dell'admin che toglie un'[[Attività]] — o una sua fascia — dal programma di un Evento. Cancella le **selezioni** delle Prenotazioni che l'avevano scelta, perché sono un impegno verso qualcosa che non esiste più, ma **non le Prenotazioni**: le Persone restano iscritte all'Evento e i loro QR restano validi all'Ingresso e alle altre Attività. I [[Check-in]] già registrati su quell'Attività **si conservano** e continuano a contare nella Visita dello [[Stato consolidato]]: sono fatti avvenuti. La regola generale è **si cancella l'impegno, non il fatto**. Modificare un Evento senza toccarne il programma non tocca alcuna Prenotazione. Chi perde un'Attività non riceve alcun avviso: verso l'Utente non esiste un canale oltre al [[Reinvio dell'email di conferma]], che è manuale. Vedi ADR `0008`.

### Reinvio dell'email di conferma
Azione riservata all'admin che rimanda l'email di conferma di una Prenotazione — la stessa del primo invio: il [[Testo dell'email di conferma]] dell'Evento seguito dal [[Riepilogo della Prenotazione]], con le etichette, le età e le [[Allergie e intolleranze]] **attuali**, e i QR nel PDF allegato. Il destinatario è precompilato con l'email memorizzata ed è **modificabile**: un indirizzo corretto viene salvato sulla Prenotazione e vale da lì in avanti per ogni comunicazione. I [[ticketCode (QR token)|ticketCode]] non cambiano: i biglietti già ricevuti restano validi. Apre una nuova [[Consegna dell'email di conferma]], ed è il rimedio previsto quando la precedente è fallita.

### Prenotazione riservata agli account (requireAccount)
Booleano a livello di Evento impostato dall'admin. Se **true**, per prenotare quell'Evento bisogna essere un [[Membro]] **loggato e con email verificata**; la Prenotazione viene collegata al Membro. Se **false**, la prenotazione anonima funziona come oggi (nome + `contactEmail`, senza login). Interazione con l'embed: quando un Evento è sia `requireAccount` sia `embedEnabled`, **per ora vince `requireAccount`** — il form incorporato rifiuta la prenotazione anonima e rimanda al sito principale. La coesistenza embed↔account va progettata in una sessione dedicata.

### Collegamento Prenotazione–Membro
Una Prenotazione è collegata a un Membro **solo tramite FK esplicita** (`registrations.userId`), impostata quando il Membro è loggato al momento della prenotazione (sempre per gli Eventi `requireAccount`; anche per gli Eventi anonimi se per caso è loggato). **Mai** per corrispondenza su `contactEmail`: quest'ultima è testo non verificato e un match esporrebbe la Prenotazione di uno sconosciuto (e i nomi dei suoi Figli) nello Storico di chi digita la stessa email. Le Prenotazioni anonime non compaiono in alcuno Storico.

### Storico partecipazioni
Vista nella [[Membro|area personale]] (`/profilo`): l'elenco degli Eventi che il Membro ha **prenotato** (via `registrations.userId`), ciascuno annotato con lo **stato di check-in reale** della sua Persona (presente/assente all'Evento, ed eventualmente a quali Attività/Slot). «Partecipazione» = Prenotazione **più** esito del [[Check-in]]; include quindi anche i no-show, marcati come tali.

### Incorporamento
Il form di registrazione di un Evento reso **su un sito terzo**, tramite uno snippet `<script>` che il sito ospitante inserisce nella propria pagina e che a sua volta apre il form in un iframe. È abilitato per Evento (`embedEnabled`) e vincolato alle [[Origine Autorizzata|Origini Autorizzate]]. Chi prenota da lì compila lo stesso form del sito principale, con i limiti descritti in [[Prenotazione riservata agli account (requireAccount)]]. **Titolo e Luogo dell'Evento, sopra il form, si spengono separatamente**: il sito ospitante di solito li dice già lui, e su una pagina che si intitola all'evento ripeterli dentro l'iframe è rumore — un luogo, poi, può non voler dire nulla lì dove il form è incorporato. Spegnerli è un fatto **solo visivo**: il titolo resta come intestazione per chi usa uno screen reader, perché dentro l'iframe è l'unica cosa che dice a quale Evento ci si iscrive — la pagina ospitante è un altro documento. La scelta vale per la superficie incorporata in quanto tale, **incorniciata o no**: chi apre l'indirizzo dell'embed a mano vede quel che vedrebbe dentro l'iframe. Assenti = si vedono, quindi nessun Evento già pubblicato cambia aspetto. Sull'[[Esito della Prenotazione]] si spengono allo stesso modo, e solo qui, **i biglietti a schermo** — quattro QR fanno un riquadro alto duemila pixel dentro la pagina di qualcun altro, e l'email li porta comunque — e il bottone **«Nuova registrazione»**, che per un visitatore è un vicolo cieco ([[Una sola risposta per email]]) e serve solo a chi iscrive più persone di seguito da un banco. I *testi* di quella schermata non sono qui: appartengono all'Evento e valgono su ogni superficie.

### Aspetto dell'Incorporamento
I sei valori con cui l'admin fa prendere al form [[Incorporamento|incorporato]] i colori e il carattere del sito che lo ospita: **accento**, **testo**, **sfondo**, **carattere**, **scala del testo** e **raggio degli angoli**. Appartiene all'Incorporamento e non all'[[Evento]]: esiste solo per la ragione di non sembrare un form incollato dentro la pagina di qualcun altro, ragione che sulle superfici nostre — pagina pubblica, biglietto, email di conferma — non esiste, e che infatti non tocca.

Tre proprietà lo definiscono più della lista dei sei:
- **Gli altri colori sono derivati, non scelti.** Bordi, testo attenuato e superfici nascono dal colore del testo, così che con un testo blu virino all'azzurro invece di restare grigi; il colore del testo *dentro* il bottone è calcolato dall'accento e non è configurabile, perché un bottone illeggibile è l'unico esito davvero inaccettabile.
- **O tutti e sei o nessuno.** Assente significa l'aspetto odierno. Un Aspetto a metà moltiplicherebbe gli stati e renderebbe non calcolabile il contrasto fra testo e sfondo.
- **Il contrasto si avvisa, non si impone.** Sotto la soglia AA il pannello lo dice e lascia salvare: il brand e la sua esposizione sono del committente. Vedi ADR `0013`.

### Origine Autorizzata
Origine (schema + host + porta) ammessa a **incorniciare** il form incorporato di un Evento; l'elenco è deciso dall'admin per Evento e diventa la direttiva CSP `frame-ancestors`. Tre proprietà sono facili da sbagliare e falliscono in silenzio — il form non viene reso e non compare alcun errore sul sito ospitante:
- **Vale l'intera catena degli antenati, non solo il sito visitato.** I costruttori di siti non incollano lo snippet nella pagina: lo salvano su un dominio proprio e lo mostrano in un iframe, che diventa così un antenato intermedio da autorizzare a sua volta (in Wix `<dominio-con-trattini>.filesusr.com`).
- **`www` e apex sono origini distinte.** Autorizzare l'apex di un sito che reindirizza a `www` produce una voce che non può mai corrispondere a nulla.
- **Non è un confine di riservatezza.** La pagina incorporata resta raggiungibile e utilizzabile direttamente da chiunque conosca l'id dell'Evento: l'elenco protegge dal clickjacking e dall'uso del marchio altrui, non dall'accesso. Vedi ADR `0006`.

### Permetti sovrapposizioni
Booleano a livello di Evento impostato dall'admin. Se falso, il sistema impedisce a una Prenotazione di selezionare Slot che si sovrappongono nel tempo. Se vero, gli Slot sovrapposti sono consentiti. Le [[Attività ad accesso libero|Attività ad accesso libero]] non entrano nel confronto: la loro finestra è larga per costruzione e collidere con tutto ciò che accade al suo interno sarebbe un artefatto, non una regola.

### Policy di selezione Attività
Impostazione a livello di Evento decisa dall'admin in fase di creazione. Determina come la Prenotazione viene associata alle Attività:
- **Tutte obbligatorie** — la Prenotazione include tutte le Attività.
- **Minimo N** — la Prenotazione deve includere almeno N Attività.
- **Libera** — l'Utente sceglie liberamente quali Attività includere in fase di Registrazione.

Senza [[Attività]] la policy non ha referente: non viene chiesta all'admin e nessuna delle tre regole si applica alla Prenotazione. Le [[Attività ad accesso libero|Attività ad accesso libero]] non entrano in nessuno dei conteggi: restano sempre facoltative, così il «non mi interessa» è una scelta vera e non un bottone da nascondere.

### Regola di capacità (atomica)
Una Registrazione è **atomica**: se anche un solo Slot selezionato non ha posti liberi sufficienti per **tutte** le Persone della Prenotazione, l'intera Registrazione fallisce. Nessuna iscrizione parziale, nessuna famiglia divisa. Un Evento senza [[Attività]] non ha Slot e quindi **nessun tetto**: la regola non ha nulla su cui applicarsi, e le superfici pubbliche non parlano affatto di posti anziché annunciarne zero. Lo stesso vale, Slot per Slot, per le [[Attività ad accesso libero|Attività ad accesso libero]]: uno Slot senza tetto viene saltato, non confrontato con zero.

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
Valore di ritorno delle mutation di check-in, mappato dalla UI sugli stati esistenti (`event-valid`, `event-already`, `activity-valid`, `activity-already`, `exit-valid`, `exit-already`, `exit-not-entered`, `exit-disabled`, `not-registered-activity`, `too-early`, `too-late`, `wrong-event`, `not-found`, `lookup`). Le mutation Convex sono transazionali: lo stato viene ri-letto dentro la transazione per evitare doppi check-in e overbooking. Ogni esito che risolve una Persona porta con sé il suo [[Stato consolidato]].

### Stato consolidato
Riepilogo dei **tre momenti di [[Check-in]]** di una Persona — Ingresso all'Evento, **Visita** (accesso alle Attività) e Uscita — ciascuno nella stessa forma: prima volta, numero di passaggi, ultima volta. Un momento mai registrato vale «—», non sparisce: «non è ancora uscito» è un'informazione; e quando i passaggi sono più d'uno compare anche l'ultimo, altrimenti dopo un rientro la scheda racconterebbe l'orario sbagliato. La Visita fonde in un unico momento i check-in di **tutte** le Attività della Persona (prima visita, somma degli accessi, ultima visita), perché all'operatore serve una risposta sola: il contatore è quindi il numero di passaggi alle Attività, non le ripetizioni della stessa. Lo stato accompagna **ogni** [[Esito check-in]] che risolve una Persona **dell'Evento scansionato**, a prescindere dal momento scansionato; un QR di un altro Evento non lo riceve, perché quei tre momenti riguardano l'altro Evento e verrebbero letti come se riguardassero questo. È la stessa storia raccontata dalla result card dello scanner, dal pannello admin dell'Evento (con etichetta o nome, età e [[Allergie e intolleranze]]) e dalle colonne «Ingresso», «Visita» e «Uscita» dell'export.

### Solo verifica
Quarta modalità dello scanner, sempre disponibile: mostra lo [[Stato consolidato]] della Persona **senza registrare nulla**. È implementata come `query` Convex (`checkins.lookup`) e non come mutation, così la garanzia di sola lettura è strutturale — il runtime non concede scritture alle query. Richiede la stessa autorizzazione dell'operatore dei momenti che scrivono (admin / [[Staff (Operatore / Assistente)|Assistente]] associato / unlock via password).

### Check-in
Atto di scansionare il QR di una Persona. Avviene:
1. **All'ingresso dell'Evento** — validazione generale.
2. **All'ingresso di ogni Attività** — verifica che la Persona sia iscritta a quell'Attività e che stia arrivando nella fascia oraria corretta (arrivo troppo in anticipo/fuori orario = bloccato).
3. **All'uscita dall'Evento** — solo per gli Eventi con la [[Registrazione dell'uscita]] attiva; richiede un ingresso già registrato (uscita senza ingresso = bloccata).

### Registrazione dell'uscita
Impostazione a livello di Evento decisa dall'admin (`recordExit`, disattiva di default). Se attiva, lo scanner offre la modalità «Uscita», che registra l'orario di uscita della Persona dall'Evento in campi speculari a quelli d'ingresso (prima uscita, contatore, ultima uscita). Un'uscita senza ingresso registrato è **bloccata** («Non risulta entrato») e non scrive nulla, così una scansione nella modalità sbagliata non corrompe i dati. Le ri-uscite seguono la stessa regola dei rientri (riuso QR): riuso off → «già registrata»; riuso on → il contatore avanza e l'ultima uscita si aggiorna.
