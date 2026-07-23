# Una sola risposta per email per Evento

## Status

accepted — supera le «Regole di coerenza per email» di ADR 0004

## Contesto e decisione

Le regole di ADR 0004 («no» dopo «no» = upsert, «sì» dopo «no» = la Prenotazione cancella la Rinuncia) presupponevano che la stessa persona usasse sempre la stessa email. In pratica non è garantito: il form di Rinuncia accetta un'email digitata liberamente, mentre la Prenotazione di un Membro loggato persiste l'email dell'account. La stessa persona può così rispondere «sì» e «no» con email diverse, i controlli incrociati non si incontrano mai e in database convivono una Prenotazione e una Rinuncia contraddittorie (osservato in test manuale: Rinuncia → Prenotazione → Rinuncia).

Decisione: per ogni Evento, un'email (normalizzata trim + lowercase) può avere al massimo **una** risposta self-service — una Prenotazione **o** una Rinuncia. Qualsiasi invio successivo con la stessa email è **bloccato** con un messaggio che invita a scrivere un'email all'organizzatore. Ogni modifica è un rimedio riservato all'admin: l'Annullamento della Prenotazione (ADR 0004) o la nuova **Rimozione della Rinuncia**. Nel form di Rinuncia di un Membro loggato vale l'email dell'account — come già per la Prenotazione — così «sì» e «no» parlano sempre della stessa email.

## Considered Options

- **Mantenere le transizioni automatiche rendendole simmetriche** (es. «no» dopo «sì» cancella la Prenotazione) — scartata: il form è non autenticato, chiunque conosca l'email di un collega potrebbe cancellargli la Prenotazione (stessa ragione di ADR 0004).
- **Bloccare solo sugli Eventi con Conferma di partecipazione** — scartata: anche senza quel flag la stessa email poteva creare più Prenotazioni duplicate sullo stesso Evento; la regola unica è più semplice da spiegare e da verificare.

## Consequences

- Niente più upsert della Rinuncia né cancellazione automatica della Rinuncia alla Prenotazione: ogni transizione di stato passa dall'organizzatore.
- Un'email può avere **una sola Prenotazione per Evento**, anche negli Eventi senza Conferma di partecipazione (prima era possibile prenotare più volte con la stessa email).
- Per gli utenti anonimi due email diverse restano due persone diverse (nessun identity linking, ADR 0003): il blocco è per email, non per persona. Il caso resta rimediabile solo dall'admin.
- Il pannello admin espone la Rimozione della Rinuncia accanto all'Annullamento della Prenotazione: sono i due rimedi indicati dai messaggi di blocco.
