# L'Evento ha date proprie opzionali che vincono sulla derivazione

## Status

accepted

## Contesto e decisione

L'Evento non ha mai avuto una data: `startsAt`/`endsAt` sono **derivati** dal minimo degli inizi e dal massimo delle fini delle sue [[Attività]]. Finché ogni Evento aveva almeno un'Attività la derivazione bastava, e infatti il glossario non definiva da nessuna parte «la data dell'Evento».

Ammettendo un [[Evento]] senza Attività (ADR `0010`) la derivazione non ha più sorgente, e `formatDateRange(null, null)` restituisce «Data da definire». Quella stringa non finisce solo sulla card e sulla pagina pubblica: finisce nell'intestazione del **biglietto PDF**. Un biglietto senza data non è un biglietto — l'evento una data ce l'ha, è l'app a non conoscerla.

Decidiamo di dare all'Evento **date proprie opzionali** (`startsAt`, `endsAt` sul documento `events`), nello stile `assente = comportamento odierno` già usato in tutto lo schema:

> `startsAt` = quello dichiarato, se c'è; altrimenti il minimo degli inizi delle Attività; altrimenti niente.
> `endsAt` = quello dichiarato, se c'è; altrimenti il massimo delle fini delle Attività; altrimenti niente.

Inizio e fine sono **indipendenti**: la fine richiede l'inizio e deve essergli successiva, ma l'inizio sta in piedi da solo — l'ora di fine di una cena nessuno la sa, e un orario inventato finirebbe stampato sul biglietto.

La dichiarazione **vince sempre** sulla derivazione, anche quando l'Evento ha Attività: un Evento può cominciare alle 20 con la prima Attività alle 21, e non è una contraddizione da risolvere ma un fatto da rappresentare.

## Considered Options

- **Nessuna data propria**, con la data scritta dall'admin nella descrizione e nel [[Testo dell'email di conferma]] (già markdown libero per Evento) — scartata: costa zero, ma lascia il biglietto PDF muto proprio per la specie di Evento in cui il biglietto è l'unica cosa che il partecipante porta con sé.
- **Date proprie obbligatorie**, con le Attività vincolate a caderci dentro — scartata: è il modello che si disegnerebbe partendo da zero, ma impone a ogni Evento esistente una finestra che nessuno ha dichiarato e trasforma ogni modifica d'orario di un'Attività in una possibile violazione da spiegare all'admin.
- **Coppia obbligatoria** (o entrambe le date o nessuna) — scartata: obbligherebbe a inventare un orario di fine per poter dichiarare quello d'inizio.
- **Solo l'inizio dichiarabile**, fine sempre derivata — scartata: produrrebbe l'ibrido peggiore, due fonti dentro la stessa riga di testo resa all'utente.

## Consequences

- Ogni lettura resta `string | null` come oggi: card, pagina pubblica, PDF, export, ordinamento di `listPublic` non cambiano forma — cambia solo da dove arriva il valore. La derivazione resta, come ripiego.
- La modifica riguarda **tutti** gli Eventi, non solo quelli senza Attività: è per questo che è una decisione a sé e non un dettaglio di ADR `0010`.
- Gli Eventi esistenti non richiedono backfill: campi assenti = derivazione odierna.
- Una fine **derivata** può cadere prima di un inizio **dichiarato** — cena alle 20, allestimento pomeridiano fra le Attività — e in quel caso la lettura non la rende: resterebbe «20:00 – 15:00» stampato sul biglietto, e un biglietto che mente sull'orario è peggio di uno che tace. A tacere è solo la lettura: la dichiarazione resta in tabella e la fine ricompare da sé se le Attività si spostano. Prevenirlo in scrittura vorrebbe dire vincolare le Attività alla finestra dell'Evento, che è l'opzione scartata qui sopra.
- «Data da definire» resta possibile — un Evento senza Attività e senza date dichiarate — ma diventa una scelta dell'admin invece di una condanna.
