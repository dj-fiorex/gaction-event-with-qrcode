# Aspetto dell'Incorporamento: sei valori scelti, dieci token derivati

## Status

accepted

## Contesto e decisione

Il form incorporato su un sito terzo ha sempre l'aspetto predefinito dell'app. Sulla homepage del committente che ha originato la richiesta — un sito Wix con testo blu `#28348a`, accento magenta `#e5007c`, Helvetica e corpo 18px — il nostro riquadro grigio-neutro con Geist si legge come un pezzo di un'altra applicazione incollato nella pagina.

Decidiamo di introdurre l'[[Aspetto dell'Incorporamento]] come **proprietà dell'[[Incorporamento]]**, accanto a `embedEnabled` e alle [[Origine Autorizzata|Origini Autorizzate]], con **sei valori scelti dall'admin** — accento, testo, sfondo, carattere, scala del testo, raggio — dai quali si **derivano** i restanti token del design system.

Le conseguenze scelte esplicitamente:

- **Vale solo dentro l'iframe.** La pagina pubblica, il biglietto e l'email di conferma non sono toccati. La forza che giustifica la feature è «non sembrare di qualcun altro dentro la pagina di qualcun altro», e sulle superfici nostre non esiste. Promuoverlo un domani ad Aspetto dell'Evento resta possibile: è una rinomina più un'applicazione più larga, non un cambio di modello.
- **I dieci token non scelti si derivano con `color-mix()` in oklab.** Bordo al 12%, testo attenuato al 60%, superfici al 4% fra testo e sfondo. Le percentuali riproducono le luminosità del tema odierno (0,897 contro 0,9; 0,487 contro 0,5; 0,966 contro 0,97), ma il motivo non è la fedeltà al default: è che con un testo blu bordi e testo attenuato diventano *azzurrini*, coerenti col brand. Dieci campi colore separati li lascerebbero grigi, e il form continuerebbe a sembrare estraneo pur essendo «configurato».
- **Il testo dentro il bottone è calcolato, non scelto.** Bianco quando il bianco supera la soglia AA, altrimenti il contrasto migliore fra bianco e nero. La preferenza per il bianco non è estetica gratuita: sul magenta del committente il massimo contrasto puro sceglierebbe il nero per 4,62 contro 4,54, e il bottone finirebbe col testo nero mentre il sito che lo ospita lo scrive in bianco.
- **`--destructive` resta fuori.** Il rosso d'errore è semantico, non è brand: un committente col rosso in tavolozza non deve poter rendere indistinguibile un messaggio di errore.
- **Il contrasto fra testo e sfondo si avvisa e non si blocca.** Il pannello mostra il rapporto e segnala sotto 4,5:1; la mutation accetta comunque. Il brand e la relativa esposizione sono del committente, e un blocco duro trasformerebbe ogni tavolozza pallida in un ticket senza via d'uscita.
- **O tutti e sei o nessuno.** `embedTheme` assente = aspetto odierno, quindi nessun backfill. Il pannello prepopola i campi col default, così cambiare il solo colore del bottone resta una sola modifica pur salvando l'oggetto intero.
- **Lo sfondo è sempre opaco.** Un iframe trasparente si sposerebbe con qualunque fondo, anche a motivo, ma il rapporto di contrasto — l'unica cosa che avvisiamo — diventerebbe incalcolabile, e un ospite che un domani passa a un hero scuro farebbe sparire il nostro testo in silenzio, sul suo sito.

## Considered Options

- **Ereditare l'aspetto dal sito ospitante.** `embed.js` gira *dentro* la pagina ospite e potrebbe leggerne gli stili calcolati passandoli all'iframe: zero configurazione. Scartata su un fatto misurato proprio su quel sito: `getComputedStyle(document.body)` lì restituisce Arial 10px `#000`, perché i valori veri vivono sugli span interni. Non esiste «l'elemento che è il design». In più il font ereditato arriva come un nome (`helvetica-w01-light`) che la nostra origine non può caricare, e ogni restyle del sito ospite ci cambierebbe il form in silenzio.
- **Rilevare l'aspetto una volta e prepopolare i campi.** Scartata per il prezzo: un `curl` su quella pagina non restituisce nulla di utile — è renderizzata dal client — quindi servirebbe un browser headless in produzione per risparmiare cinque minuti di digitazione, una volta per Evento.
- **Esporre tutti i ~15 token del design system.** Scartata: nessun committente sa rispondere a «colore del testo su primario», e la combinazione bianco-su-bianco diventerebbe raggiungibile. Soprattutto, non risolve il problema vero — i token secondari resterebbero grigi perché nessuno li compila.
- **Due sole manopole, accento e carattere.** Scartata perché non esprime il caso che ha originato la feature: quel sito ha il *testo* blu, non solo l'accento.
- **Un blocco di CSS libero.** Scartata: smette di essere un dato modellabile, non è validabile né migrabile, e il CSS può esfiltrare valori digitati tramite selettori su attributi.
- **Caricare il font del brand come file.** Scartata per licenza, non per costo: l'Helvetica di quel sito è Monotype servita sotto licenza Wix, non nostra da ridistribuire, e un campo «carica il tuo font» inviterebbe il committente a farlo. Il carattere resta un'enum di stack di sistema; la conseguenza onesta è che l'accostamento è esatto su macOS e approssimato (Arial) su Windows.
- **Un'entità Tema riusabile fra Eventi.** Scartata per ora: introdurrebbe permessi, ciclo di vita e propagazione delle modifiche prima che esista un secondo Evento che li chieda.

## Consequences

- `loadEventWithStats` espone `embedTheme` **al pubblico**, a differenza di `allowedOrigins`: è il form incorporato a doverlo leggere, e non rivela nulla che non sia già visibile guardandolo.
- Assente, il form non riceve **alcuna** sovrascrittura: restano gli `oklch` di `globals.css`, con la punta di blu nei bordi che il default convertito in esadecimale perderebbe. «Assente = comportamento odierno» è vero alla lettera.
- La scala del testo si applica come `font-size` dell'elemento radice dentro l'iframe, perché le utility `text-*` di Tailwind sono in `rem`: è l'unico punto da cui si muovono tutte insieme e in proporzione. Per la stessa ragione il campione d'anteprima nel pannello admin usa misure in `em` — nel pannello la radice è quella della pagina admin, e un campione in `rem` mentirebbe sulla scala.
- Il carattere si applica come `font-family` esplicita e non come variabile: in Tailwind v4 il blocco `@theme inline` incorpora il valore dentro l'utility `font-sans`, che quindi non rilegge `--font-sans`. Colori e raggio passano invece da `var()` e si sovrascrivono per sottoalbero.
- Il primo fotogramma dell'iframe non è tematizzato: l'Aspetto arriva con i dati dell'Evento, come il titolo. Nello stesso istante c'è già lo scheletro di caricamento, quindi non «lampeggia» un aspetto sbagliato — si riempie. Con uno sfondo non bianco resta però visibile un passaggio.
- `ResizeObserver` nell'iframe non va toccato: un cambio di scala altera l'altezza del contenuto e l'osservatore riporta la nuova misura al documento ospitante da sé.
