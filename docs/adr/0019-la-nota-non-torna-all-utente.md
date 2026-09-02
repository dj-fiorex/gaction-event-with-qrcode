# La Nota non torna all'Utente

## Status

accepted

## Contesto e decisione

Il form pubblico raccoglie fatti: nomi, età, email, Slot, allergie. Non c'era un posto dove chi risponde potesse *dire* qualcosa — «arriviamo alle 21», «siamo in sedia a rotelle», «l'anno prossimo sì». Quel testo oggi arriva all'organizzatore per email, fuori dall'app, scollegato dalla riga a cui si riferisce.

Decisione: una [[Nota]] facoltativa in coda al form pubblico, **della [[Prenotazione]] e non della [[Persona]]**, governata da un interruttore per [[Evento]] (`collectNotes`), visibile **solo** all'admin nel pannello e nell'export.

Le scelte che danno forma alla decisione:

- **La Nota non torna mai all'Utente.** Non entra nell'email di conferma né nel suo [[Riepilogo della Prenotazione|Riepilogo]], non compare sul [[Biglietto]], non arriva allo scanner. Qui la Nota si separa dalle [[Allergie e intolleranze]], che attraversano quasi tutte quelle superfici: le allergie sono un **dato operativo** che deve viaggiare fino al varco e alla cucina, la Nota è **un messaggio a una persona**. Rimandarla indietro in un'email la trasformerebbe in una ricevuta, e una ricevuta è una promessa di risposta che il prodotto non mantiene. È il cuore di questo ADR: chi in futuro pensasse di «completare» la simmetria con le allergie aggiungendola al Riepilogo sta riaprendo una scelta, non correggendo una dimenticanza.
- **Un solo interruttore, due tabelle.** `collectNotes` accende la textarea su tutti e due i rami del form: la Prenotazione e la [[Rinuncia]]. La nota di chi dice «no» — *perché* no — è spesso l'informazione più utile che un organizzatore riceva, e senza questo non avrebbe nessun posto dove finire. Due interruttori separati avrebbero moltiplicato gli stati (una Nota che c'è sul «sì» e non sul «no») per una distinzione che nessun organizzatore ha chiesto di fare.
- **Della Prenotazione, non della Persona.** Una nota di contesto parla dell'invio, non di un corpo. Metterla per Persona — come le allergie — avrebbe moltiplicato per quattro i campi vuoti nel form di una famiglia e reso ambiguo dove scrivere una cosa che vale per tutti.
- **Etichetta fissa, «Note».** Il termine di glossario e la parola sullo schermo coincidono. Una domanda scrivibile dall'admin per Evento resta possibile domani, come campo opzionale in più e senza backfill; oggi sarebbe copy da scrivere per accendere un campo.
- **Mille caratteri, ricontrollati nella mutation.** `register` e `decline` sono mutation pubbliche, chiamabili senza passare dal form: il tetto vive in `lib/schemas.ts` per il form e di nuovo in `convex/registrations.ts` e `convex/declines.ts` per il server, come già per le allergie. Trecento — il tetto delle allergie — è giusto per un elenco di sostanze e stretto per una frase: chi si trova tagliato a metà scrive all'organizzatore per email, cioè fa esattamente ciò che il campo doveva evitare.
- **Nessun flag `notesProvided`.** L'analogo di ADR `0017` qui non serve. `collectNotes` è patchabile su Eventi con Prenotazioni esistenti, ma spegnerlo non reinterpreta nulla di ciò che è già stato scritto: una Nota è una Nota, e la sua assenza non è mai stata un'etichetta generata dal server. Il caso che ADR `0017` doveva rendere inesprimibile qui non esiste.
- **Vuota = assente.** Trim ai bordi, a-capo interni conservati (è una textarea, e la gente ci scrive elenchi a mano). Una stringa vuota non entra mai in tabella, e con l'interruttore spento una nota inviata comunque dal client viene ignorata — stesso trattamento che [[Raccolta nomi]] riserva ai nomi non richiesti.

## Considered Options

- **Nota per Persona, come le allergie.** Scartata: vedi sopra.
- **La presenza del testo come interruttore**, sul modello di `privacyNotice` (informativa vuota = nessuna casella). Elegante — un campo invece di due, nessuno stato parziale — ma avrebbe obbligato l'admin a scrivere copy per accendere una textarea, e avrebbe legato la parola «Note» a ciò che scrive lui invece che al glossario.
- **Nota anche nel Riepilogo dell'email.** Valutata come ricevuta («abbiamo letto»). Scartata: vedi la prima conseguenza.
- **Nota sulla result card dello scanner.** Scartata: la Nota è della Prenotazione e lo scanner è per Persona, quindi comparirebbe identica sui biglietti di tutti e quattro i membri di una famiglia. E all'operatore al varco serve il dato che sblocca l'ingresso, non un paragrafo di prosa.
- **Colonna «Note» nella tabella admin.** Scartata: una nona colonna larga quanto un paragrafo rende illeggibile la tabella per tutte le Prenotazioni senza Nota, che sono la maggioranza. Al suo posto un'icona presente solo quando la Nota c'è, e una modale col testo intero.

## Consequences

- **La Nota è un canale a senso unico.** L'Utente non ha nessuna conferma di essere stato letto: non riceve indietro ciò che ha scritto e non sa se qualcuno lo leggerà. È il prezzo accettato per non promettere una risposta; l'alternativa non era «una ricevuta onesta», era una ricevuta che sembra un impegno.
- **Nel foglio Excel delle Prenotazioni la stessa Nota si ripete su ogni riga-Persona** della stessa famiglia, come già fanno `Email` e `Registrato il`. È il prezzo di un foglio denormalizzato per Persona, che resta la forma giusta per quel foglio.
- **La legge solo l'admin.** `registrations.listAll` e `declines.list` sono già dietro `requireAdmin`, e la Nota non entra in nessuna superficie accessibile agli [[Staff (Operatore / Assistente)|Assistenti]]. Un'informazione utile al varco scritta in una Nota non arriva al varco: se un Evento ne avesse bisogno, è l'ADR da riaprire.
- **Il tetto è 1000 qui e 300 per le allergie.** Due numeri invece di uno, deliberatamente: misurano due cose diverse.
- `register` e `decline` prendono un argomento `notes` in più. Essendo opzionale, nessun client esistente smette di funzionare.
