# Ogni Consegna dell'email di conferma lascia una riga

## Status

accepted

## Contesto e decisione

Nessuno sapeva se l'email di conferma fosse arrivata. L'unico indizio erano tre `console.log` in `emails.ts`, che finiscono nei log del deployment Convex: effimeri, fuori dal pannello, e che nessuno apre se non sta già indagando perché qualcuno ha telefonato. Il committente non aveva modo di accorgersi di un guasto, e l'[[Utente]] nemmeno.

Decisione: ogni tentativo di far arrivare l'email diventa un fatto registrato — la [[Consegna dell'email di conferma]] — in una tabella `emailDeliveries`, una riga per tentativo.

Le scelte che danno forma alla decisione:

- **Una tabella, non un campo sulla Prenotazione.** Un campo sarebbe bastato alla domanda che l'admin si fa davvero («a chi non è arrivata?»), e un Reinvio riuscito ne sovrascriverebbe il fallimento precedente senza rimpianti. La tabella è stata scelta deliberatamente per avere lo **storico**, e si ripaga su un punto preciso: il Reinvio può **cambiare il destinatario** salvato sulla Prenotazione, quindi un campo solo non saprebbe più dire a quale indirizzo erano andate le email precedenti.
- **La riga nasce col tentativo, non col suo esito.** `register` la inserisce **in corso** nella stessa transazione in cui pianifica l'invio (ADR `0015`); l'action la chiude appena il provider risponde, via `ctx.runMutation` — un'action non ha `ctx.db`. Scrivere solo righe terminali sarebbe stato più semplice, con un solo scrittore e niente da patchare, ma avrebbe reso di nuovo invisibile il tentativo che non conclude — cioè proprio il guasto per cui esiste tutto questo.
- **Cinque esiti, e `rifiutata` non è `non riuscita`.** Oggi `sendTickets` collassa i due casi nello stesso `{ delivered: false, simulated: false }` e il chiamante non può distinguerli. Ma vogliono rimedi diversi: un rifiuto del provider è di norma permanente e chiede di correggere l'indirizzo o la configurazione, mentre un'eccezione dice che non siamo riusciti nemmeno a chiedere, e lì ritentare ha senso. La distinzione costa un valore d'enum e cambia il consiglio che il pannello dà.
- **La riga porta il destinatario effettivamente usato.** Senza, lo storico non risponde alla domanda per cui lo si è voluto.
- **Si cancella con la Prenotazione.** L'[[Annullamento della Prenotazione]] è già una cancellazione dura che porta via anche i [[Check-in]] — cioè fatti avvenuti — quindi la regola «si cancella l'impegno, non il fatto» dell'ADR `0008`, che vale per l'[[Eliminazione di un'Attività]], qui non si applica. E la riga contiene un indirizzo email: un dato personale non deve sopravvivere alla riga che lo giustificava, in un progetto che tiene copia dell'informativa accettata su ogni Prenotazione (ADR `0012`).
- **In admin l'icona compare solo dove serve attenzione**, accanto al Contatto: rifiutata, non riuscita, simulata, o in corso da troppo. Una consegna riuscita non mostra niente, perché una tabella in cui ogni riga porta una spunta verde insegna a ignorare la colonna.
- **Sopra la tabella, un conteggio.** È la parte che fa il lavoro vero: il guasto dominante — dominio non verificato, quota esaurita, `RESEND_API_KEY` assente in produzione — non rompe *una* Prenotazione, le rompe **tutte**. Duecento icone identiche non sono un allarme, sono carta da parati: comunicano duecento problemi quando il problema è uno.
- **L'Utente vede l'esito dal vivo.** Con l'invio passato al server il browser non riceve più alcun valore di ritorno, ma Convex è reattivo: la schermata di [[Esito della Prenotazione]] si iscrive con una query pubblica che, dato un `registrationId`, ritorna **solo l'esito** — nessun indirizzo, nessun nome. A consegna riuscita conferma con l'indirizzo; a guasto invita a scaricare il PDF **adesso**, che è l'unico istante in cui l'Utente può ancora rimediare da solo: fra dieci minuti ha chiuso la scheda e il suo `ticketCode` vive solo in un'email che non arriverà. Vale doppio quando `embedShowTickets` è spento e i QR non si vedono nemmeno.

## Considered Options

- **Un campo sulla Prenotazione** invece della tabella — più economico e sufficiente alla domanda dell'admin. Scartata per scelta esplicita di avere lo storico; resta la via di ripiego se un giorno la tabella pesasse più di quanto rende.
- **Un cron che chiude le consegne rimaste in corso**, patchandole in uno stato `abbandonata`. Scartata: `convex/` non usa lo scheduler per nulla di ricorrente oggi, e soprattutto **scriverebbe una bugia** — «abbandonata» afferma che il tentativo è finito male, mentre l'unica cosa che sappiamo è che non ne abbiamo più saputo nulla, che è precisamente ciò che «in corso» più l'istante di creazione già dicono. La soglia vive quindi **in lettura**: si cambia con un deploy e senza toccare i dati.
- **Spunta verde su ogni riga consegnata.** Scartata: vedi sopra.

## Consequences

- **La riga registra ciò che sappiamo, non la verità.** Se l'action muore dopo che il provider ha accettato ma prima di chiudere la riga, l'admin vedrà un guasto per un'email arrivata. Chiudere quella finestra costerebbe idempotenza e una chiave di deduplica lato provider, per un caso raro il cui esito peggiore è un doppione — e il [[Reinvio dell'email di conferma]] è manuale e innocuo. Accettato consapevolmente.
- **«Consegnata» significa accettata dal provider, non letta.** Oltre quel punto non abbiamo visibilità e non fingiamo di averla; i webhook di Resend sono un lavoro a sé, mai iniziato. Il limite è stato misurato, non solo previsto: un invio verso un dominio inesistente si chiude **`consegnata`**, perché Resend accetta e il rimbalzo arriva dopo, su un canale che non ascoltiamo. `rifiutata` copre quindi solo ciò che il provider respinge *subito* — sintassi, dominio non verificato, quota — ed è comunque la classe di guasto che rompe tutte le Prenotazioni insieme, cioè quella per cui esiste il conteggio.
- Con la pianificazione server-side dell'ADR `0015`, lo stato **in corso** diventa quasi vestigiale: dura secondi, e può restare appeso solo se l'action muore a metà. La soglia in lettura resta, ma scatterà di rado.
- `registrations.listAll` legge una cosa in più per riga. Non è una classe di problema nuova: fa già `.collect()` sull'intera tabella e una lettura per Prenotazione di Persone e selezioni.
- **Attrito noto con l'[[Esito della Prenotazione]] (ADR `0014`).** La copy di quella schermata è scritta dall'admin e per l'Evento Vender **afferma che l'email è partita e dove cercarla**. Se la consegna fallisce, l'avviso che aggiungiamo contraddice, nella stessa schermata, una frase che l'admin ha scritto. Non lo risolviamo qui: le parole restano sue, il fatto resta nostro, e la contraddizione è comunque preferibile al silenzio di oggi.
