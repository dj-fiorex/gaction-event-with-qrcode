# Evento senza Attività: nessun tetto di posti e nessuna regola di selezione

## Status

accepted — decisione presa, implementazione da fare

## Contesto e decisione

Il vincolo «almeno un'Attività» viveva in due punti — lo zod del form (`.min(1)`) e `validateEventInput` sul server — ma non nello schema: nulla nel modello dei dati lo richiedeva. Alcuni raduni non hanno segmenti orari: una cena aziendale, un'assemblea, un open day. Lì il QR serve per l'Ingresso ed eventualmente l'Uscita, e non c'è nulla da prenotare a fasce.

Decidiamo che un [[Evento]] **può non avere Attività**, e che questa è una **forma legittima e permanente** dell'Evento, non uno stato di bozza: è pubblico e prenotabile come ogni altro. L'app non ha (e non acquista qui) un ciclo di vita dell'Evento.

Le conseguenze scelte esplicitamente:

- **Nessun tetto di posti.** La capienza resta un concetto dello [[Slot]]: senza Slot non c'è limite. Non introduciamo una capienza propria dell'Evento.
- **Il pubblico tace sui posti.** Card e pagina pubblica non mostrano né il badge né la riga «N/N occupati» quando l'Evento non ha Attività; l'admin legge «Illimitati» e ha già i numeri veri in «Persone totali dentro» e «Registrazioni».
- **Le impostazioni senza referente non si chiedono e non si annunciano.** [[Policy di selezione Attività]] e minimo N (normalizzati a `free`/`0`), «Permetti sovrapposizioni» e [[Tolleranza check-in]] spariscono dal form e dal dettaglio admin quando la lista Attività è vuota, e ricompaiono con la prima Attività aggiunta.
- **«Nessuna Attività» si esprime con la lista vuota**, non con un interruttore: cade il guard che nasconde il cestino sull'ultima Attività, e il fieldset vuoto spiega cosa comporta.
- **Le superfici vuote spariscono**: la sezione «Attività in programma» della pagina pubblica, la sezione «Attività» del form di registrazione, e la modalità «Accesso attività» dello scanner — quest'ultima con lo stesso schema già usato per l'Uscita (`recordExit`), fallback a «Ingresso» compreso se l'ultima Attività sparisce mentre lo scanner è aperto.

## Considered Options

- **Stato di bozza** (Evento creato vuoto, Attività aggiunte dopo, non prenotabile finché è vuoto) — scartata: richiederebbe un concetto di pubblicazione che oggi non esiste (`listPublic` restituisce tutti gli Eventi), cioè un pezzo di dominio molto più grande di quello richiesto.
- **Capienza propria dell'Evento** (`events.capacity`) — scartata: introduce una seconda dimensione di capienza che dovrebbe convivere con quella degli Slot in ogni lettura (DTO, form, monitor, export, messaggi d'errore) e apre subito la domanda «cosa vince quando ci sono entrambe?». Se servirà un tetto su un Evento senza segmenti orari, sarà una richiesta successiva e ben identificabile.
- **Badge «Posti illimitati» sul pubblico** — scartata: è una promessa che l'organizzatore probabilmente non vuole fare. La sala ha un limite fisico, è solo che non lo sta contando nell'app; dirlo in pubblico invita a leggerlo come garanzia.
- **Mostrare il numero di iscritti al posto dei posti** — scartata: espone in pubblico un dato oggi visibile solo come frazione della capienza, e non serve a chi guarda.
- **`activityPolicy` opzionale nello schema** (assente = nessuna Attività) — scartata: costa una migrazione widen→migrate→narrow su un campo obbligatorio per esprimere ciò che `activities.length === 0` già dice, e obbliga ogni lettura a gestire l'assenza.
- **Lasciare la policy scelta dall'admin anche a zero Attività** — scartata: lascerebbe nel documento un valore scelto per un mondo che non c'è, che *sembra* attivo.
- **Interruttore esplicito «questo evento ha attività?»** — scartata: aggiunge un booleano che può contraddire i dati (un «no» con tre Attività in lista) e obbliga a decidere chi vince. L'assenza di documenti è già la sua rappresentazione.

## Consequences

- La regola «policy `free` con zero selezioni è un errore» va condizionata all'esistenza di Attività: con Attività presenti resta il comportamento odierno.
- `soldOut` era già guardato per zero slot (`allSlots.length > 0 && …`): un Evento senza Attività non risulta «Esaurito». Restavano da correggere solo le due superfici che annunciavano «0 posti liberi» accanto a un form aperto.
- Un Evento senza Attività non ha data derivabile: senza ADR `0009` nascerebbe con un biglietto che dice «Data da definire». Le due cose vanno rilasciate insieme, o quella prima.
- Gli Eventi esistenti non sono toccati: il vincolo cade, non cambia nulla per chi ha già Attività.
