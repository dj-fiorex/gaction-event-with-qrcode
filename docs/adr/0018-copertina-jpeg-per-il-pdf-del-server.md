# La copertina si salva in JPEG, perché il PDF dei biglietti lo rende anche il server

## Status

accepted

## Contesto e decisione

L'[ADR `0002`](./0002-event-image-convex-storage.md) fa ritagliare l'[[Immagine dell'Evento]] nel browser e la ricodifica **in WebP** (con ripiego JPEG se il canvas non lo sa produrre), «così i blob restano piccoli». Andava bene finché l'unico a leggerla era un browser.

L'[ADR `0015`](./0015-invio-email-conferma-lavoro-del-server.md) ha portato il rendering del PDF dei [[Biglietto|biglietti]] anche **sul server**, in una action Node di Convex. `@react-pdf/image` decodifica **solo JPEG e PNG**: nel browser la copertina passa da un canvas e viene ricodificata al volo, nel server il canvas non c'è e un decoder WebP nemmeno. Risultato, già registrato come «perdita rumorosa» in `lib/pdf/render-tickets.tsx`: **il PDF allegato all'email parte senza copertina** per praticamente ogni Evento, perché WebP è quello che il pannello produce. Finché la copertina era un ornamento in cima al biglietto, il difetto era sopportabile.

Con l'[[Intestazione del Biglietto]] non lo è più. Quando l'admin sceglie l'immagine **al posto del titolo**, e l'immagine non si può renderizzare, l'intestazione ripiega sul titolo: giusto per il foglio, ma vorrebbe dire che l'opzione **non si vede mai nell'email** — la superficie da cui i biglietti arrivano davvero — e si vede solo nei PDF scaricati a mano. Una scelta dell'Evento che vale su un renderer e non sull'altro contraddice l'ADR `0015` («l'aspetto non può divergere»).

Decisione: **l'uscita del ritaglio diventa JPEG** (qualità 0,9). Per l'admin non cambia niente in ingresso — il campo accetta `image/*` e il canvas ricodifica qualunque cosa gli si dia — cambia solo ciò che finisce nello storage. Entrambi i renderer lo decodificano nativamente. Lo sniff dei magic bytes lato server **resta**: i file salvati prima di questo ADR sono WebP e devono continuare a degradare in modo rumoroso, non a far fallire il PDF.

## Considered Options

- **Lasciare com'è**, con l'email che ripiega sul titolo. Scartata: la feature non funzionerebbe sulla superficie principale, e il buco preesistente resterebbe aperto.
- **Decodificare WebP nel server** (`sharp` con binari nativi, o `@jsquash/webp` in wasm) dentro l'action Node. Coprirebbe anche i file già caricati. Scartata: binari nativi e wasm nel bundler di Convex sono terreno fragile, e aggiungono una dipendenza per un problema che il client risolve a costo zero scegliendo il formato alla sorgente. Gli Eventi esistenti sono pochi e la copertina si ricarica in un minuto.
- **PNG.** Funziona con entrambi i renderer e, lossless, tiene i bordi di un logo perfetti. Scartata perché una copertina *fotografica* a 1600 px diventa 2-4 MB, e quel peso entra in **ogni** allegato email. Alla misura dell'intestazione (≈128×72 pt, riduzione di 12 volte) gli artefatti JPEG sono invisibili; a 0,9 lo sono anche nell'hero della pagina pubblica.
- **Tenere WebP e salvare un gemello JPEG per il PDF.** Scartata: due file per copertina da tenere allineati, cancellare e migrare, in cambio di qualche centinaio di KB per Evento.

## Consequences

- `lib/image-crop.ts` / `components/admin/event-image-field.tsx`: MIME di uscita `image/jpeg`, qualità 0,9; il `Content-Type` inviato allo storage segue il blob.
- **Nessuna migrazione.** Le copertine già in storage restano WebP: continuano a vedersi sul sito e a mancare nel PDF del server, con l'avviso di `render-tickets.tsx`. Chi le vuole nel biglietto le ricarica dal pannello, una volta per Evento.
- L'ADR `0002` resta valido su storage, ritaglio 16:9 e `storageId`; sul **formato** è sostituito da questo ADR.
- Pagina pubblica ed `EventCard` non cambiano aspetto; il peso della copertina in pagina cresce del 20-30% per le foto, nulla per i loghi su fondo piatto.
