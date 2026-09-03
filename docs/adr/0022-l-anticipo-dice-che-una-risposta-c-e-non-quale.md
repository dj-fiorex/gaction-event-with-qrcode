# L'anticipo dice che una risposta c'è, non quale

## Status

accepted

## Contesto e decisione

[[Una sola risposta per email]] (ADR `0005`) era una regola che si scopriva **all'invio**: chi aveva già risposto compilava l'intero form — nome, [[Figlio|Figli]], [[Ospite|Ospiti]], [[Slot]], allergie, consenso — e solo allora leggeva che non poteva proseguire. Il form ora la **anticipa**: appena l'e-mail è nota, un avviso compare sotto il campo e il bottone di invio si spegne.

Anticiparla richiede una query pubblica e non autenticata che, dato un [[Evento]] e un indirizzo, dica se quell'indirizzo ha già risposto. È un **oracolo di enumerazione**: chiunque apra il form può digitare l'e-mail di un collega e sapere qualcosa di lui. L'oracolo in sé non è nuovo — `register` e `decline` sono mutation pubbliche e rifiutano già con quell'informazione — ma inviare un form costa fatica umana, mentre una query si chiama a velocità macchina.

Decisione: la query ritorna **un booleano e nient'altro**. La distinzione fra [[Prenotazione]] e [[Rinuncia]] **non lascia il server**. Restano precisi i due messaggi con cui le mutation rifiutano l'invio, perché lì nominano il rimedio giusto ([[Annullamento della Prenotazione]] o [[Rimozione della Rinuncia]]); l'anticipo dice soltanto che una risposta esiste. All'utente legittimo non manca nulla: in tutti e due i casi il rimedio è lo stesso, scrivere all'organizzatore.

Il confine è tenuto dal `returns: v.boolean()` della query, non da una convenzione sul testo del messaggio. Non è decorazione: è ciò che rende quel confine impossibile da erodere per distrazione.

## Considered Options

- **Ripetere nell'avviso i due messaggi precisi delle mutation.** Coerenza totale fra ciò che si legge prima e ciò che si legge dopo, un vocabolario solo. Scartata: renderebbe gratuita l'informazione «Tizio ha rinunciato alla cena», che è la parte davvero sensibile. ADR `0003` aveva già scartato il collegamento dello [[Storico partecipazioni|Storico]] per `contactEmail` con una preoccupazione della stessa famiglia.
- **Nessun anticipo: solo il rifiuto all'invio**, ora finalmente visibile grazie ad ADR `0021`. Sarebbe bastato a chiudere il sintomo osservato, a costo zero di superficie pubblica. Scartata: lascia intatto lo spreco di far compilare tutto a chi non può inviare.
- **Query reattiva (`useQuery`) invece di una lettura sola all'uscita dal campo.** Più idiomatica in Convex, e l'avviso si aggiornerebbe dal vivo. Scartata per due ragioni che si sommano: le [[Prenotazione|Prenotazioni]] memorizzano `contactEmail` **così come digitata**, quindi il confronto normalizza a lettura e legge *tutte* le Prenotazioni dell'Evento — una sottoscrizione per ogni form aperto rileggerebbe l'intero elenco a ogni nuova Prenotazione; e una lettura per battitura, invece che per indirizzo completo, è proprio ciò che trasforma un oracolo in un'API di enumerazione.
- **Colonna e-mail normalizzata con indice su `registrations`**, come già fa `declines`. Farebbe crollare quel costo a `O(1)` per l'anticipo *e* per ogni `register`/`decline` di oggi. Scartata **per ora**: è una migrazione su dati vivi che questa modifica non ha bisogno di pagare. Resta la mossa giusta il giorno in cui quel controllo diventasse caldo.
- **Rate limiter sulla nuova query.** Scartata: le query Convex non possono scrivere, quindi un contatore obbligherebbe a trasformare una domanda di sola lettura in una mutation. E soprattutto sarebbe teatro: `register` e `decline` restano due porte aperte sulla stessa informazione, senza limiti. Se un giorno si irrobustisce, si irrobustiscono tutte e tre insieme.

## Consequences

- **L'anticipo è cortesia, non controllo.** Fra la lettura e l'invio la stessa e-mail può rispondere da un'altra scheda: la garanzia resta il rifiuto server-side nelle mutation, e quella corsa si legge ora accanto al bottone (ADR `0021`).
- **Se la rete cade, l'anticipo tace.** Nessun utente viene chiuso fuori da un controllo che non è riuscito a completarsi: si torna al comportamento di sempre, con il rifiuto all'invio.
- **Il [[Membro (Account personale)|Membro]] loggato non vede il form affatto.** La sua e-mail è quella dell'account e non è modificabile: se ha già risposto non esiste nessun refuso da correggere, quindi al posto del form legge un avviso — come già succede per l'e-mail non verificata. È anche l'unico caso in cui il controllo parte al montaggio: un campo `readOnly` non riceve mai il fuoco, quindi non lo perde mai.
- **La normalizzazione dell'e-mail si è spostata in `lib/`.** La usano tutte e due le sponde, e due copie divergerebbero in silenzio su uno spazio di troppo.
- Vale su **tutti e due i rami** del form pubblico, Prenotazione e Rinuncia: il vincolo che anticipa è uno solo, e non avrebbe senso scoprirlo presto da un lato e tardi dall'altro.
