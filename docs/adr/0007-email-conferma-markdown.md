# Email di conferma composta in markdown, QR solo in allegato

## Status

accepted

## Contesto e decisione

Il corpo dell'email di conferma era **scritto nel codice**: una fascia d'intestazione fissa, la riga `Dove:`, una frase generica, la riga del PDF e un blocco generato per ogni [[Persona]] con il QR incorporato come immagine `cid:`. Il committente ha poi consegnato la propria copy per l'Evento Vender, satura di fatti che appartengono a **quel solo** Evento — una data, un anniversario, la regola del badge aziendale, un link alle FAQ. Nessuno di quei fatti può vivere in `emails.sendTickets`: il prossimo Evento avrebbe fatti diversi, e ogni cambio di virgola sarebbe un deploy.

Decisione: il [[Testo dell'email di conferma]] diventa **markdown scritto dall'admin per ogni Evento** (`events.emailSubject`, `events.emailBody`), reso da [`emailmd`](https://www.emailmd.dev/) — MJML sotto, tabelle e stili inline in uscita — e l'email spedita è **quel testo seguito dal [[Riepilogo della Prenotazione]] generato**. I QR code **non compaiono più nel corpo**: viaggiano solo nel PDF allegato, che porta già una pagina per Persona.

Le scelte che danno forma alla decisione:

- **Un solo campo markdown, non due.** Non essendoci più nulla da innestare *in mezzo* al corpo, non servono un `intro` e un `outro` né un token segnaposto da spiegare a chi scrive.
- **L'oggetto è un campo a sé**, non una chiave del frontmatter del corpo. Un'indentazione YAML sbagliata non deve poter togliere in silenzio l'oggetto a un'email che poi parte comunque. Il frontmatter resta disponibile per `preheader` e per il tema.
- **La copy si legge server-side.** `sendTickets` si riduce a `{ registrationId, pdf }` e rilegge da sé Evento, testo, Persone e destinatario, invece di accettarli dal browser. Il PDF resta l'unica cosa che il client manda, perché è il client a renderizzarlo.
- **Corpo e Riepilogo si concatenano come markdown**, prima di una sola `render()`. Nessuno splicing di HTML, e nessun renderer di anteprima separato: il form admin passa il corpo per lo stesso `emailmd` che rende l'email in partenza, quindi ciò che l'admin scrive si vede com'è. L'anteprima si ferma al corpo — il Riepilogo si aggiunge all'invio, quando le Persone esistono — quindi mostra fedelmente la parte che si sta scrivendo, non l'email intera.
- **Campi vuoti = comportamento odierno**, nello stile `assente = comportamento odierno` già usato in tutto lo schema: gli Eventi esistenti continuano a mandare la stessa email, senza backfill.
- **Il Riepilogo sopravvive.** Togliere i blocchi per Persona avrebbe tolto le [[Allergie e intolleranze]] da tutto ciò che l'[[Utente]] riceve: i biglietti PDF non le riportano, e CONTEXT.md registra che sono visibili nell'email di conferma per scelta esplicita del committente. Il Riepilogo le conserva senza portare un dato sanitario sul foglio mostrato al varco.

Il rischio del markdown è che il testo dell'Utente (nomi, allergie) entri nel documento come *sorgente*: un nome con un asterisco diventerebbe corsivo, uno con un tag diventerebbe HTML. Per questo il Riepilogo **neutralizza** quei valori prima di comporli, mentre il corpo dell'Evento resta markdown pieno — è scritto dall'admin, non dal pubblico.

## Considered Options

- **Un renderer di sottoinsieme markdown scritto in casa** in `lib/` (paragrafi, grassetto, corsivo, link, elenchi puntati, stili inline) — scartata: era il ripiego previsto se lo spike (#41) avesse trovato `emailmd` inservibile dentro un'action Convex `'use node'`. Lo spike è passato: push e invocazione riuscite, `render()` restituisce `html`, `text` e `meta`, nessun limite di bundle segnalato, circa +2,4 s sul tempo di push. Scriverlo comunque avrebbe significato mantenere una grammatica, il suo renderer e la sua anteprima, per ottenere meno.
- **Mantenere i QR `cid:` incorporati** accanto al corpo componibile — scartata: è una preferenza di prodotto, non un ripiego tecnico. Gli allegati inline sono la parte più fragile della resa fra i client, e il PDF porta già gli stessi QR in una forma stampabile; tenerli in tutti e due i posti raddoppia il peso dell'email e le occasioni di sbagliare.
- **Chiudere la superficie pubblica dell'action** — rimandata, non decisa qui: il PDF è renderizzato nel browser, quindi `sendTickets` deve restare chiamabile da lì. Chi possiede un `registrationId` può innescare un reinvio — **verso l'indirizzo memorizzato, mai uno arbitrario**, cioè strettamente meno di quanto è possibile oggi. Spostare la generazione del PDF sul server è un lavoro a sé.

## Consequences

- Il testo dell'email diventa **dato dell'Evento**: si cambia dal pannello admin, senza deploy. Di riflesso, un errore di battitura nella copy non è più intercettato da nessuna review del codice.
- `emailmd` porta MJML nel bundle dell'action: circa **6 MB minificati** e **+2,4 s** sul tempo di push, senza alcun warning dalla CLI Convex. Se in futuro ci si avvicinasse a un tetto, la via d'uscita è `node.externalPackages` in `convex.json` (oggi il file non esiste: esbuild bundla tutto).
- Il corpo del markdown viene emesso come HTML semantico (`<h1>`, `<p>`, `<ul>`) dentro un `<div>` con stili inline, mentre la struttura esterna è tabellare e completamente inline. Adeguato per Gmail e Outlook; un client che azzera gli stili degli heading mostrerà l'`<h1>` col proprio default. Il rimedio, se servirà, è un override del tema nel frontmatter.
- L'editor (`@emailmd/react`) porta con sé CodeMirror e `mjml-browser`: è caricato con `next/dynamic` e `ssr: false`, quindi resta fuori dal bundle di chi non apre il form di un Evento.
- L'email ha ora anche una parte `text/plain`, generata dallo stesso `render()`: un miglioramento di recapitabilità che prima non c'era.
- Il [[Reinvio dell'email di conferma]] non ha più bisogno di ricevere il testo dal client, quindi non può più divergere dal primo invio: entrambi passano dalla stessa lettura server-side.
