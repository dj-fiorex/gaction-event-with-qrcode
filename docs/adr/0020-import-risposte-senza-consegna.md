# Le Prenotazioni importate nascono senza Consegna, e quell'assenza è il criterio dell'invio massivo

## Status

accepted — con **un solo punto superato dall'ADR `0024`**: il campo «origine» sulla
Prenotazione ora esiste, perché la regola che lo legge è arrivata dopo. Tutto il resto
di questo documento resta valido, criterio dell'invio massivo compreso.

## Contesto e decisione

Il committente di Maestri d'Acciaio ha raccolto 140 risposte con un modulo esterno prima che il form pubblico fosse pronto, e le ha mandate come Excel: 127 «sì» completi di età dei figli, familiari adulti e note, 13 «no». Chiede di caricarle e di avere in admin un tasto che mandi a tutti l'email. Nel modello di questo progetto «l'email» è una sola: la conferma con i biglietti.

Decisione: l'[[Import delle risposte]] crea **Prenotazioni e Rinunce vere**, non una lista di invitati, e **non pianifica nessuna email**. L'[[Invio massivo dell'email di conferma]] manda a tutte le Prenotazioni dell'Evento **senza alcuna [[Consegna dell'email di conferma]]**. Non esiste un campo «origine» sulla Prenotazione.

Le scelte che danno forma alla decisione:

- **Prenotazioni, non invitati.** Il file contiene già le risposte; un'email di invito al form avrebbe chiesto a 127 persone di ricompilare quello che avevano compilato, e avrebbe richiesto un secondo tipo di email da scrivere e tracciare. Con le Prenotazioni vere il tasto riusa `sendTickets`, la Consegna e il Reinvio, senza nulla di nuovo.
- **L'import non manda email, e questa è un'eccezione all'ADR `0015`.** Lì la pianificazione sta nella transazione della `register` perché *il browser non doveva restare l'unico a sapere che un'email era dovuta*. Qui non c'è un browser che sa qualcosa: l'email non è dovuta finché l'admin non decide che lo è. Se l'import spedisse, il tasto non avrebbe senso e 127 email partirebbero senza che nessuno le avesse viste.
- **Il criterio è l'assenza di Consegna, non un flag «importata».** Per l'ADR `0015` ogni Prenotazione nata dal form apre la sua Consegna nella stessa transazione; «senza Consegna» è quindi, per costruzione, «importata e mai spedita». Un campo origine aggiungerebbe uno stato che nessuna regola legge: se un giorno una Prenotazione dal form restasse senza Consegna sarebbe un bug, e spedirla sarebbe il rimedio giusto, non un errore da filtrare. La differenza nel consenso resta leggibile dalla copia testuale sulla riga («Consenso raccolto tramite modulo esterno»), senza un secondo campo che dica la stessa cosa. **Aggiornamento (ADR `0024`):** la regola è arrivata — un cliente vuole un testo di email diverso per gli importati — e il campo esiste. Il criterio dell'invio massivo resta però l'assenza di Consegna: `source` non entra in quella query.
- **Niente «rimanda a tutti».** Il secondo clic non trova nessuno. I rifiuti di Resend sono quasi tutti permanenti (ADR `0015`), un invio ripetuto brucia quota e produce doppioni nelle caselle degli ospiti; la ripetizione controllata esiste già come Reinvio, riga per riga, con destinatario correggibile.
- **Riga per riga, mai tutto o niente, mai sovrascrivere.** Un file con due email doppie su 140 non deve essere ritoccato a mano; e sovrascrivere una risposta esistente violerebbe la regola che ogni modifica passa da un rimedio esplicito dell'admin (ADR `0005`). Saltare e riportare rende l'import ripetibile: il file aggiornato di settimana prossima aggiunge solo le righe nuove.
- **Tutte le Attività ad accesso libero, nessuna a Slot.** Una Prenotazione senza selezioni verrebbe respinta allo scanner della visita allo stabilimento pur avendo un biglietto valido. Iscriverla alla visita libera è la scelta che ogni dipendente avrebbe fatto e non toglie posti a nessuno, perché non c'è un tetto. Le Attività a Slot restano fuori: una fascia non si sceglie per conto di 127 persone.

## Considered Options

- **Lista di invitati con email di invito al form.** Scartata: vedi sopra, e per il resto il committente ha detto che il form pubblico non cambia.
- **Import che pianifica l'email come `register`.** Scartata: toglie all'admin il momento in cui decide, che è l'unica ragione del tasto.
- **Campo `source: 'import'` sulla Prenotazione.** Scartata: nessuna regola lo leggerebbe, e il criterio dell'invio massivo è già esprimibile senza.
- **Import tutto o niente.** Scartata: costringe a ritoccare l'Excel per due righe su 140.

## Consequences

- Una Prenotazione può esistere **senza Consegna** anche per scelta, non solo per età. Le Prenotazioni anteriori all'ADR `0016` non hanno Consegne (nessun backfill): su un Evento vecchio l'Invio massivo le conterebbe e le spedirebbe. Il tasto lo dice nel conteggio e chiede conferma; per l'Evento per cui nasce non esiste il caso.
- Una Prenotazione può esistere **senza Consegna**, cosa che prima dell'import non accadeva mai. Le superfici che assumono «ogni Prenotazione ha almeno una Consegna» (esito nella tabella admin, export) devono leggere l'assenza come «mai spedita», non come errore.
- Le regole dell'Evento (tetti, età, nucleo familiare, una risposta per email) vanno fatte rispettare dalla mutation di import riga per riga, riusando le stesse verifiche di `register` e `decline`, non reimplementandole.
- La Nota si importa anche se l'Evento ha `collectNotes` spento: l'interruttore governa il form, non un dato che esiste già.
- L'invio massivo pianifica decine di action in una volta: gli invii vanno scalati nel tempo per non urtare il limite di richieste del provider, e la pagina admin li vede chiudersi uno alla volta dalle Consegne.
