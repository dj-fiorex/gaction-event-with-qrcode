# Identità stabile di Attività e Slot: si cancella l'impegno, non il fatto

## Status

accepted

## Contesto e decisione

Il form di modifica di un Evento non rimanda al server gli id delle [[Attività]]: `toEventInput` produce oggetti anonimi (titolo, orari, durata, capienza). Il server riceve quindi una lista **senza identità** e fa l'unica cosa possibile — cancella tutte le Attività e tutti gli Slot e li reinserisce con id nuovi. Le righe `slotSelections` e `activityCheckIns` delle Prenotazioni già fatte continuano a puntare agli id cancellati.

Il commento sopra `events.update` registrava l'orfanaggio come accettato («coerente con l'avviso in UI»), ma l'avviso in UI dice un'altra cosa — *«Salvando, gli slot delle attività vengono rigenerati in base ai nuovi orari»* — e soprattutto la conseguenza vera non è cosmetica: **una Prenotazione orfana ha perso il suo posto**. Non occupa più capienza in alcuno Slot vivo, e al varco il check-in di Attività non trova la sua selezione, quindi quelle persone risultano non iscritte. Succede a **ogni salvataggio**, anche quando l'admin non ha toccato il programma: correggere un refuso nella descrizione basta. Il sintomo visibile è l'id grezzo del documento cancellato stampato nella colonna «Attività» del pannello admin e nell'export (`?? s.activityId`), osservato su dev.

Decidiamo di dare ad Attività e Slot un'**identità stabile** attraverso la modifica: il form rimanda l'`id` di ogni Attività esistente (le nuove arrivano senza id); `events.update` patcha quelle che ci sono, inserisce le nuove e cancella **solo** quelle che l'admin ha davvero tolto. Per gli Slot vale lo stesso confronto sulla finestra oraria: uno Slot rigenerato che coincide per `start`/`end` con uno esistente ne conserva il documento e l'id.

Quando un'Attività o uno Slot viene eliminato **davvero**, e ha Prenotazioni:

- si cancellano le **selezioni** — un impegno verso qualcosa che non esiste più;
- **non** si cancellano le Prenotazioni: Persone e QR restano validi all'Ingresso e alle altre Attività;
- **non** si cancellano i [[Check-in]] già registrati: sono fatti avvenuti, e continuano a contare nella Visita dello [[Stato consolidato]];
- l'admin riceve un avviso che dice quante Prenotazioni e quante persone colpisce.

La regola generale, valida anche per i casi futuri: **si cancella l'impegno, non il fatto.**

## Considered Options

- **Mezza identità: solo le Attività.** Le selezioni ritroverebbero il titolo (colonna admin ed export a posto) ma continuerebbero a puntare a `slotId` cancellati: il posto resterebbe perso e il check-in di Attività continuerebbe a non trovarle. Sistema il sintomo e lascia il danno.
- **Nessuna identità, avviso esplicito al salvataggio** («ogni Prenotazione perderà lo Slot scelto») — scartata: onesta, ma rende la modifica di un Evento un'operazione che l'admin non fa più dopo la prima iscrizione.
- **Eliminare l'intera Prenotazione** quando il suo Slot sparisce — scartata: annullare un'Attività non è annullare la partecipazione. Farebbe sparire una famiglia dall'Evento come effetto collaterale di una modifica al programma, in silenzio e senza avvisarla, invalidando biglietti già in mano. L'azione deliberata esiste già ed è riservata all'admin ([[Annullamento della Prenotazione]], ADR `0004`).
- **Vietare l'eliminazione di uno Slot prenotato** — scartata: per togliere un'Attività prenotata da venti famiglie l'admin dovrebbe annullare venti Prenotazioni, cioè fare un danno più grande di quello che voleva evitare.
- **Cancellare anche i check-in dell'Attività eliminata** — scartata: un contatore «Visita» che scende mentre l'operatore è al varco è un errore operativo; una riga che nessuna vista nomina non è nulla. Lo [[Stato consolidato]] fonde i check-in per Persona e non nomina mai l'Attività, quindi le righe senza Attività si leggono correttamente.

## Consequences

- `events.update` smette di essere «cancella e reinserisci»: diventa un diff fra la lista inviata e quella persistita. È il punto in cui va concentrata la cura, perché è l'unico posto che può distruggere dati di Prenotazioni altrui.
- Il fallback `?? s.activityId` in `registrations-table` e in `export` va sostituito con `'—'`: un id di documento non è un'informazione per un umano, e la cella non lo tronca (traboccava nella colonna accanto).
- Il valore di un `<input type="datetime-local">` non porta il fuso, e va convertito in istante **nel browser** (`fromDatetimeLocalValue`): il server gira in UTC e, leggendo quella stringa, sposterebbe gli orari di un offset a ogni salvataggio. Uno Slot spostato è uno Slot nuovo, quindi senza questa conversione l'identità regge solo per un admin in UTC. Gli istanti già persistiti non si toccano: la conversione ferma la deriva, non riscrive il passato.
- Restano in tabella righe `activityCheckIns` con `activityId` morto. È deliberato: sono storia, non puntatori vivi.
- Chi perde un'Attività **non viene avvisato** e può presentarsi per qualcosa che non c'è più. Verso l'Utente non esiste un canale oltre al [[Reinvio dell'email di conferma]], che è manuale. Limite noto, non svista.
- Le Prenotazioni già orfane su dev restano tali: questa decisione ferma l'emorragia, non ricuce il passato (nessun modo di sapere a quale Slot puntavano).
