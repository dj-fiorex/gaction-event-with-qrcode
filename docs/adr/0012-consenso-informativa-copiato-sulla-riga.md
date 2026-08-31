# Consenso all'informativa: rifiuto nella mutation, testo copiato sulla riga

## Status

accepted — decisione presa, implementazione da fare

## Contesto e decisione

Il committente ha chiesto un flag privacy nel form pubblico. Il testo dell'informativa varia per Evento e per organizzatore, quindi diventa un campo dell'Evento che l'admin può riscrivere: `privacyNotice`, assente = nessuna casella e nessun vincolo, come già fanno `emailBody` e `collectAllergies`.

Decidiamo che il [[Consenso all'informativa]] non ha bisogno di un campo «ha acconsentito», perché **la [[Prenotazione]] stessa è la prova** — a due condizioni, che sono la sostanza di questo ADR:

- **Il rifiuto vive nella mutation, non nel bottone.** `registrations.register` e `declines.decline` ricevono il consenso come argomento e lo rifiutano quando manca. Un `<Button>` disabilitato non prova nulla di ciò che è arrivato al server: entrambe sono mutation pubbliche, chiamabili senza passare dal form. Solo con il rifiuto server-side l'implicazione «la riga esiste ⇒ il consenso c'è» è un'invariante vera anziché una speranza.
- **Il testo accettato è copiato sulla riga.** Un consenso è consenso *a un testo preciso*. Poiché `privacyNotice` è modificabile dall'admin, senza copia una Prenotazione di ottobre risulterebbe aver accettato le parole che l'admin ha scritto a novembre — e nessuno se ne accorgerebbe.

Il «quando» non richiede nulla: Convex timbra `_creationTime` su ogni documento.

Vale per **entrambi** i rami pubblici. Anche la [[Rinuncia]] raccoglie nome ed e-mail, quindi anche lì la casella c'è e anche lì la mutation rifiuta senza: non esiste una porta di servizio dove i dati personali entrano senza consenso.

## Considered Options

- **Un campo `privacyAcceptedAt` sulla Prenotazione** — scartata perché ridondante due volte: sul «se», la riga non potrebbe esistere senza consenso; sul «quando», `_creationTime` c'è già.
- **Nessuna copia, il testo lo ricostruisce git** — sarebbe stata la scelta giusta se l'informativa fosse rimasta una costante nel repo: git è un changelog datato e immutabile, e incrociarlo con `_creationTime` dà una risposta esatta a costo zero. Cade nel momento in cui il testo diventa un campo del database, che nessuno versiona.
- **Salvare solo l'impronta (sha256)** — scartata: un'impronta si verifica solo avendo l'originale a fianco. Appena l'admin sovrascrive `privacyNotice` quel testo non esiste più da nessuna parte, e l'hash prova che la riga accettò *qualcosa di diverso* senza poter dire cosa.
- **Congelare `privacyNotice` alla prima Prenotazione** — scartata: rispecchia il principio giusto (le condizioni non si riscrivono dopo che sono state accettate) ma rende permanente un refuso scoperto al secondo iscritto. E prima o poi qualcuno chiederebbe di sbloccarlo: il giorno dello sblocco si perde tutto senza accorgersene.
- **Casella bloccante solo lato client, niente persistenza** — scartata: sembra fatta e non lo è. Alla domanda «chi ha acconsentito, e quando?» non esisterebbe risposta, mentre il form suggerisce una tutela che non c'è.

## Consequences

- Il costo della copia è qualche centinaio di byte per riga e nessuna disciplina umana: non c'è un campo «versione» che qualcuno possa dimenticare di aggiornare, quindi non esistono righe che dichiarano il falso.
- L'admin resta libero di correggere l'informativa in qualsiasi momento senza toccare ciò che è già stato accettato.
- Se l'Evento non ha `privacyNotice`, la mutation non chiede nulla: gli Eventi esistenti non richiedono backfill e il form non cambia.
