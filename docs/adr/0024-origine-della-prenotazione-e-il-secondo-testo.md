# L'Origine è un fatto della Prenotazione, e il secondo testo è un'eccezione al primo

## Status

accepted — supera un solo punto dell'ADR `0020`, che per il resto regge intatto

## Contesto e decisione

Un cliente ha chiesto di poter scrivere un'email di conferma diversa a seconda di come la persona si è iscritta: il form pubblico da una parte, l'[[Import delle risposte]] dall'altra. Non una frase che cambia — **due testi interi**, con un secondo editor nel pannello.

L'ADR `0020` aveva scartato esattamente il campo che serve qui, e con una motivazione precisa: «un campo origine aggiungerebbe uno stato che nessuna regola legge». Quella motivazione era giusta il giorno in cui è stata scritta ed è stata resa falsa da questa richiesta. La regola è arrivata dopo. Non è un ripensamento: è la condizione che quell'ADR poneva, e che ora è soddisfatta.

Decisione: nasce l'**[[Origine della Prenotazione]]** — `registrations.source: 'form' | 'import'`, **obbligatorio**, scritto alla nascita e mai più toccato — e l'Evento prende un **secondo [[Testo dell'email di conferma]]**, `emailSubjectImport` e `emailBodyImport`, che **ripiega sul primo** quando è vuoto.

Le scelte che danno forma alla decisione:

- **Un fatto della riga, non dell'azione.** L'alternativa era non aggiungere niente e far dipendere il testo dall'azione: l'[[Invio massivo dell'email di conferma]] manda il secondo, tutto il resto il primo. Si rompe sul [[Reinvio dell'email di conferma]], che a un importato manderebbe il testo di chi ha compilato il form — cioè la frase sbagliata alla persona sbagliata, proprio nel momento in cui l'admin sta rimediando a un guasto. L'origine è un fatto della Prenotazione, quindi vive sulla Prenotazione, e ogni invio la rilegge da lì.

- **Obbligatorio, non `v.optional`.** È la sola deviazione dall'idioma «assente = comportamento odierno, nessun backfill» che governa tutto il resto di questo schema, e la ragione è che qui l'idioma **non è applicabile**: in tabella possono coesistere righe nate dal form e righe nate dall'import, e nessun default classifica bene entrambe. Un `source` assente non sarebbe «il comportamento di prima», sarebbe «non si sa», e «non si sa» in questo campo significa mandare l'email sbagliata senza che nessuno se ne accorga. Il campo nasce stretto perché quello stato non deve essere esprimibile.

- **Due valori, e l'[[Incorporamento]] è `form`.** Stessa mutation, stesso componente, la stessa persona che compila di sua mano: distinguere l'iframe sarebbe un terzo editor su ogni Evento, anche i tanti che l'embed non lo usano. Allargare una union è la modifica più facile che ci sia, il giorno in cui qualcuno lo chiederà.

- **Il ripiego è asimmetrico: A è il testo dell'Evento, B è l'eccezione.** Un testo import vuoto ripiega sul testo del form, che a sua volta ripiega sul default del codice, **campo per campo** come già fanno i tre dell'[[Esito della Prenotazione]] (ADR `0014`). Chi non ha bisogno della distinzione scrive un testo solo e non incontra mai la seconda casella, e nessun Evento esistente cambia una virgola di ciò che spedisce.

- **Il [[Riepilogo della Prenotazione]] non si sdoppia.** Si sdoppia la copy, cioè ciò che l'admin scrive; il Riepilogo è dato generato — biglietti e allergie — e che si veda o no resta una scelta dell'Evento, non del canale.

- **L'Origine è invisibile.** Non entra nella tabella admin né nell'export. Il campo esiste per una regola sola, ed è quella regola a giustificarlo: è lo stesso test che l'ADR `0020` gli aveva fatto fallire, e superarlo su un punto non autorizza a portarselo in giro su tutte le superfici. Aggiungere una colonna dopo è facile; toglierla, no.

- **La [[Rinuncia]] non prende il campo.** Non riceve nessuna email: il suo `source` non lo leggerebbe nessuno, e metterlo per simmetria sarebbe *precisamente* ciò che l'ADR `0020` aveva scartato. Il giorno in cui una Rinuncia riceverà un'email, quel giorno il campo avrà una regola.

## Considered Options

- **Nessun campo: il testo dipende dall'azione di invio.** Scartata per il buco sul Reinvio, descritto sopra. Era l'unica opzione che lasciava l'ADR `0020` letteralmente intatto, e il prezzo era sbagliare l'email nel caso in cui contava di più.
- **L'admin sceglie la copy al momento dell'invio, e la scelta resta memorizzata.** Reggerebbe tre testi domani senza cambiare il modello, perché il prodotto non saprebbe *perché* i testi sono più d'uno. Scartata: aggiunge una scelta a ogni invio — quindi un errore possibile a ogni invio — per una generalità che nessuno ha chiesto, e non risponde alla domanda posta, che era esplicitamente «in base a come l'utente si è registrato».
- **`source` dedotto al volo da `privacyNoticeAccepted`.** Il consenso copiato sulla riga distingue già le importate («Consenso raccolto tramite modulo esterno»), ed è l'ADR `0020` stesso a farci affidamento. Scartata: promuoverebbe una **stringa di copy a discriminante portante**, e riformularla riclassificherebbe il passato in silenzio, senza un errore e senza un avviso — è lo stesso guasto che l'ADR `0017` ha chiuso mettendo `nameProvided` sulla riga invece di rileggere `collectNames`.
- **`source: 'self' | 'onBehalf'`.** Nome più fedele al fatto di dominio — chi ha dichiarato la risposta, l'interessato o l'organizzatore per suo conto — e regge il caso futuro della Prenotazione inserita a mano dal pannello. Scartata: il cliente dice «import», il pannello dirà «importate», e un codice che dicesse un'altra parola imporrebbe una traduzione a ogni conversazione.
- **Sdoppiare anche `emailShowSummary`.** L'argomento è concreto: sull'importato il Riepilogo elenca «Figlio 1», «Ospite 1» e nessuna allergia, perché nessuno gliene ha mai chieste. Scartata: un interruttore in più da spiegare per una simmetria che quasi nessuno userebbe.
- **Restringere l'Invio massivo a `source === 'import'`.** Il tasto farebbe letteralmente ciò che dice il suo nome. Scartata: l'argomento dell'ADR `0020` regge intatto — «se un giorno una Prenotazione dal form restasse senza Consegna sarebbe un bug, e spedirla sarebbe il rimedio giusto, non un errore da filtrare» — e restringere ora toglierebbe quel rimedio in silenzio.

## Consequences

- **L'ADR `0020` resta valido tranne che su una riga.** Cadono «Non esiste un campo origine sulla Prenotazione» e il paragrafo che lo motiva. Restano in piedi, e sono la sostanza di quell'ADR: l'import crea Prenotazioni vere, l'import non manda email, il criterio dell'Invio massivo è l'assenza di [[Consegna dell'email di conferma]], niente «rimanda a tutti», riga per riga senza sovrascrivere, tutte le [[Attività ad accesso libero]] e nessuna a Slot.
- **`sendPendingConfirmations` non si tocca.** Il criterio resta `latestDelivery(...) === null`. L'Origine non entra in quella query.
- **L'ADR `0016` resta intatto: la Consegna non congela quale testo è partito.** `recipient` è congelato lì perché è **mutabile** — il Reinvio lo cambia — mentre `source` è immutabile e ogni Consegna può rileggerlo dalla riga senza mentire. Resta vero, come già oggi, che la Consegna non sa quali *parole* siano partite: la copy è riscrivibile in ogni momento. Questa decisione non peggiora quel confine né lo migliora.
- **`source` è obbligatorio, quindi ogni punto di inserimento lo dichiara**, `convex/seed.ts` compreso. Non ci sono default nascosti da nessuna parte: se un chiamante lo dimentica, è `tsc` a dirlo, non un'email sbagliata tre settimane dopo.
- **Se il push dello schema trovasse righe senza `source`**, quello è il segnale che serviva un widen-migrate-narrow in tre tempi. Lo dice un comando, non serve prevederlo qui.
- **La catena di ripiego è una funzione pura** in `lib/email-content.ts`, accanto a `ticketsEmailSubject` e per la stessa ragione: si prova senza Convex, e i quattro casi (import scritto, import vuoto, entrambi vuoti, solo l'oggetto scritto) sono quattro asserzioni e non quattro invii.
- **Il pannello ha un secondo riquadro**, «Email per le prenotazioni importate», subito sotto a «Email di conferma» e non dentro: la forma dice l'asimmetria del ripiego — uno è il testo, l'altro è l'eccezione — e lascia l'interruttore del Riepilogo dove vale, cioè per entrambe. Costa una seconda istanza dell'editor markdown, che porta CodeMirror e `mjml-browser`; resta un `next/dynamic` con `ssr: false`, quindi il peso lo paga solo chi apre il form di un Evento.
