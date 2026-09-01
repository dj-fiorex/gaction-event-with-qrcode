# Nome e cognome sono due campi, e la riga si ricorda chi ha scritto il nome

## Status

accepted

## Contesto e decisione

Una [[Persona]] aveva un campo solo, `name`, in cui finiva tutto: «Mario Rossi», «Mario», «Rossi Mario», e — con la [[Raccolta nomi]] spenta — anche l'[[Etichetta posizionale]] «Ospite 1». Chi legge un elenco di iscritti non può dire quale metà sia il cognome, e nessuno può ordinare, cercare o esportare per cognome senza indovinare.

Decisione: nome e cognome diventano due colonne, `firstName` e `lastName`, su `persons` e su `declines`. Ogni riga di `persons` porta inoltre `nameProvided`, che dice se quel nome l'ha dichiarato chi prenota o l'ha generato il server.

Le scelte che danno forma alla decisione:

- **`nameProvided` sta sulla riga e non si rilegge da `event.collectNames`.** Sembra un flag duplicato — l'impostazione dell'Evento sa già se i nomi si raccolgono — ma non lo è: `collectNames` è **patchabile** su Eventi che hanno già Prenotazioni (`convex/events.ts`), quindi leggerlo *oggi* per interpretare un nome scritto *tre settimane fa* reinterpreta il passato. È un bug che **esisteva già**: `lib/email-content.ts` decideva l'intestazione del [[Riepilogo della Prenotazione]] con `!collectNames && person.category !== 'user'`, quindi spegnere la Raccolta nomi dopo una Prenotazione stampava «**Luca Rossi**» come se fosse un'etichetta, e accenderla dopo iscrizioni anonime stampava «**Ospite 1** — Ospite», che dice due volte la stessa cosa. Con il flag sulla riga il caso non è più esprimibile. **È il cuore di questo ADR**: senza, avremmo solo spezzato una stringa in due.
- **Il cognome non si chiede a [[Figlio|Figli]] e [[Ospite|Ospiti]].** Solo l'[[Utente]] ha `lastName`, ed è obbligatorio; sulle altre righe il campo è assente. Assente non vuol dire «non ancora compilato», vuol dire che non gli è mai stato chiesto: il form dice «Nome del figlio», e allargarlo a due caselle per Persona non era la richiesta.
- **L'Etichetta posizionale resta un nome fittizio dentro `firstName`**, non un campo `position` né un campo `label`. Non è un'informazione in più da modellare: è ciò che si scrive dove starebbe il nome quando un nome non c'è. A distinguerla dal resto basta `nameProvided`.
- **`users` non si tocca.** È il profilo di [[Membro|Convex Auth]] e il suo `name` resta monolitico; `/registrati` continua a chiedere «Nome e cognome» in un campo solo. Il dominio qui è quello dell'iscrizione a un Evento, non quello dell'account.
- **I DTO portano la coppia; a comporre è un solo helper.** `fullName` in `lib/person-name.ts` è l'unico posto che sa che si scrive «Mario Rossi» e mai «Rossi Mario», e che senza cognome resta il solo nome. Stesso ruolo che `resolveEventDates` ha per le date dell'Evento. Nessun `name` già composto viaggia nei DTO: da una stringa composta il cognome non si riestrae, e l'export ha due colonne da riempire.
- **Il precompilamento dal [[Membro]] loggato spezza sul primo spazio.** `splitFullName` è dichiaratamente un'euristica, ed è legittima **solo** perché è un suggerimento in due caselle che un umano rivede prima di inviare. Tutto ciò che segue il primo spazio è cognome: i cognomi composti sono più comuni dei nomi composti scritti senza trattino.
- **Nessuna migrazione.** Non ci sono dati veri in produzione: lo schema è scritto direttamente nella forma finale, senza campi opzionali tenuti per il passato e senza narrow differito, e i dati di sviluppo si ripopolano.

## Considered Options

- **`givenName` / `familyName`** invece di `firstName` / `lastName` — più corretti per le culture in cui l'ordine si inverte. Scartati: il repo è in italiano nei nomi di dominio e in inglese nei nomi di campo, e `firstName`/`lastName` è ciò che ogni lettore si aspetta di trovare. `nome`/`cognome` scartati per la stessa ragione, dal verso opposto.
- **Chiedere il cognome anche a Figli e Ospiti.** Scartata esplicitamente. Vedi le conseguenze.
- **Rileggere `collectNames` invece di `nameProvided`.** È il comportamento odierno, ed è il bug che questo ADR chiude.
- **Ordinare gli elenchi admin per cognome.** Valutata e scartata: `convex/attendance.ts` continua a ordinare sulla stringa composta, come oggi. È l'unico ordinamento per nome dell'app, e cambiarlo non era stato chiesto.

## Consequences

- **L'ambiguità resta a metà, per scelta.** Chi scrive «Giulia Bianchi» nel campo nome di un Ospite ricrea lì esattamente il problema che abbiamo appena tolto all'Utente. È una conseguenza accettata della decisione di non allargare il form, non una svista: chi in futuro pensasse di «aggiustarla» aggiungendo il cognome a Figli e Ospiti sta riaprendo una scelta, non correggendo un difetto.
- **Nell'export le colonne `Cognome` sono vuote per Figli, Ospiti ed Etichette posizionali.** È corretto, e per questo la cella resta **vuota** invece di portare il trattino che il foglio usa per «qui non c'è niente»: un trattino direbbe «manca» a un dato che non è mai stato raccolto.
- **A parità di configurazione il comportamento visibile non cambia.** L'email di conferma, i biglietti PDF, lo scanner e le tabelle admin mostrano le stesse parole di prima. L'unica differenza si vede cambiando `collectNames` dopo una Prenotazione — cioè nel caso che prima mentiva.
- `register` prende `userFirstName` e `userLastName` al posto di `userName`, e `decline` prende `firstName` e `lastName`: sono mutation pubbliche, quindi un client vecchio smette di funzionare. Non ce ne sono fuori da questo repo — il form incorporato è servito da qui.
