# Un recapito dell'Evento, non un messaggio d'errore per Evento

## Status

accepted

## Contesto e decisione

Il committente ha chiesto una cosa precisa: che accanto al campo e-mail del form si legga «Questa mail è già stata utilizzata. Per modificare la precedente registrazione scrivi a info@maestridacciaio.it», e che il testo sia **personalizzabile per Evento**, perché l'indirizzo cambia da un evento all'altro.

La richiesta descrive un messaggio, ma la cosa che varia è **un indirizzo**. [[Una sola risposta per email]] parla all'utente da quattro superfici — l'anticipo sotto il campo e-mail, il rifiuto di `register`, il rifiuto di `decline`, l'avviso al [[Membro (Account personale)|Membro]] loggato che il form non lo vede affatto — e tutte e quattro dicevano già «invia un'email all'organizzatore» senza poter dire a quale indirizzo, perché un indirizzo dell'organizzatore sull'Evento non esisteva.

Decisione: la nuova impostazione è **[[E-mail dell'organizzatore]]**, un indirizzo validato e facoltativo, non un testo libero. I quattro messaggi restano scritti da noi e diventano **testa più coda**: la testa dice il fatto e distingue il ramo dove può, la coda dice il rimedio ed è una sola per tutte e tre — «Per modificare la risposta scrivi a *indirizzo*», oppure la formulazione di sempre quando il campo è vuoto. L'indirizzo si legge come link `mailto:`, perché su un telefono e dentro l'[[Incorporamento]] «scrivi a info@…» senza link obbliga a trascrivere a mano.

Il campo si chiama come una proprietà dell'Evento e non come l'errore che oggi lo usa. È l'unico uso che ne facciamo — non è il mittente delle email, che vale per tutto il deployment, e non è un reply-to — ma un campo battezzato su un messaggio d'errore sarebbe un nome che invecchia male al primo secondo uso.

## Considered Options

- **Un testo libero per Evento, che sostituisce il messaggio ovunque.** È la lettera della richiesta, e c'è un precedente forte: `emailSubject`, `emailBody`, i tre campi dell'[[Esito della Prenotazione]] (ADR `0014`) sono tutti testo libero per Evento. Scartata perché **un solo testo deve servire due rami**: «per modificare la precedente registrazione» è falso per chi ha rinunciato, e nessuna riscrittura del testo può accorgersene. Un recapito strutturato quel caso non lo esprime proprio.
- **Un recapito libero** (indirizzo, numero di telefono, «info@… o 0123 456789»). Coprirebbe l'organizzatore senza casella dedicata. Scartata: niente validazione, quindi un refuso resta lì finché non arriva la mail che non arriva mai; niente `mailto:`; e i testi andrebbero riscritti per reggere qualunque contenuto («contatta X» invece di «scrivi a X»).
- **Il testo nuovo solo dove c'è un indirizzo, altrimenti parola per parola quello di prima.** Sarebbe stato il modo abituale di questo repo di introdurre un'impostazione — assente = comportamento odierno, nessuna riga cambia. Scartata: due formulazioni dello stesso fatto convivrebbero per sempre, e la prossima volta che se ne ritocca una l'altra resterebbe indietro in silenzio. Qui il ripiego è la **coda**, non l'intero messaggio.
- **Fondere i due rifiuti in un testo solo.** Una costante invece di due. Scartata: eroderebbe la parte di ADR `0022` per cui il rifiuto server-side nomina il rimedio giusto, e soprattutto il report dell'[[Import delle risposte]] perderebbe l'unica informazione per cui lo si legge — se la riga saltata era un sì o un no.
- **Mettere il campo nel riquadro «Email di conferma» del pannello.** È lì che l'admin ha in testa le e-mail dell'Evento. Scartata: quel riquadro governa un'email che *parte*, questo è un indirizzo che *riceve*, e la vicinanza farebbe credere che le risposte alla conferma finiscano lì — cosa che non succede.

## Consequences

- **ADR `0022` regge intatto.** `registrations.hasResponse` continua a ritornare `v.boolean()`, e l'anticipo prende la sola testa generica: dice *che* una risposta c'è, mai *quale*. Il recapito non cambia nulla di quel confine, perché è identico nei due rami — ed è anzi la ragione per cui la coda può essere una sola.
- **La coda non entra nel report dell'Import.** È l'unica superficie che prende `emailAlreadyUsedHead` senza `emailAlreadyUsedTail`: lì chi legge è l'organizzatore, e leggerebbe dodici volte l'invito a scrivere a se stesso. La regola vive nel commento di quel punto e nel test, che asserisce l'uguaglianza esatta con la testa — non un `stringContaining`, che lascerebbe passare una coda aggiunta per distrazione.
- **I testi cambiano anche agli Eventi che l'indirizzo non ce l'hanno.** Le teste sono nuove per tutti; solo la coda ripiega. Due test asserivano sulla stringa vecchia e sono stati aggiornati.
- **`requireEmailUnusedForEvent` prende l'Evento e non il suo id**, perché la coda porta un suo campo. Nessuna lettura in più: tutti i chiamanti avevano già il documento in mano.
- **Forma dell'indirizzo e testi vivono in `lib/email.ts`**, accanto a `normalizeEmail` e per la stessa ragione di ADR `0022`: li usano tutte e due le sponde — il server per rifiutare, il form per anticipare, lo zod del pannello per segnare il campo in rosso — e due copie divergerebbero in silenzio.
- **`LinkedText` è ora un componente condiviso.** Il rendering dei link viveva dentro l'[[Esito della Prenotazione]]; serve anche a `FormAlert` e all'anticipo, e una seconda copia sarebbe divergita alla prima modifica.
- Il campo è **pubblico** nel DTO. Chi apre il form e digita l'indirizzo di qualcun altro già iscritto legge l'e-mail dell'organizzatore: è un recapito di servizio, fatto per essere contattato, e la stessa informazione è comunque destinata a chiunque prenoti.
