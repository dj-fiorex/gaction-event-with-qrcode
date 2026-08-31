# Attività ad accesso libero: uno Slot unico e invisibile, esente dalle regole di fascia

## Status

accepted — decisione presa, implementazione da fare

## Contesto e decisione

Il committente di un Evento ha chiesto una visita allo stabilimento «ad accesso libero: dalle 15 alle 17, si entra quando si vuole», con una sola domanda all'iscritto — «mi interessa / non mi interessa» — e nessuna fascia oraria da scegliere. Il modello non sapeva esprimerlo: ogni [[Attività]] è per costruzione una finestra divisa in [[Slot]] con capienza, e il form pubblico rende sempre una tendina.

Decidiamo di introdurre l'[[Attività ad accesso libero]] come **impostazione per-Attività**, e di implementarla generando **un solo Slot** largo quanto l'Attività, con **capienza illimitata**.

Le conseguenze scelte esplicitamente:

- **Lo Slot esiste nel database, ma non nel dominio.** Nessuna superficie lo nomina: il form pubblico chiede se la visita interessa, la pagina dell'Evento non elenca fasce, l'admin non vede né Durata né Capienza. Chi legge la tabella `slots` ne trova comunque uno: è la scelta di questo ADR, non una svista.
- **`slots.capacity` diventa nullable**, `null` = nessun tetto. È lo stesso principio dell'ADR `0010` — la capienza è un concetto dello Slot, e uno Slot può non averla — applicato un livello più in basso.
- **Esente dalle sovrapposizioni.** La finestra di un'Attività ad accesso libero è larga per costruzione: farla collidere con tutto ciò che accade al suo interno sarebbe un artefatto dell'implementazione, non una regola di dominio.
- **Esente dalla [[Policy di selezione Attività]].** Non entra nel conteggio di «tutte obbligatorie» né di «minimo N», così resta sempre facoltativa e il «Non mi interessa» è una scelta vera anziché un bottone da nascondere.
- **La risposta è però obbligatoria.** Facoltativa è la visita, non la risposta: senza scelta l'invio è bloccato, con lo stesso meccanismo già usato dalla [[Regola del nucleo familiare]]. Una casella non spuntata confonderebbe «no» e «non ho letto la sezione», sottostimando gli interessati di una quantità che nessuno può misurare.

Entrambe le esenzioni discendono da una frase sola: **una visita libera non occupa il tuo tempo, lo attraversa.**

## Considered Options

- **Zero Slot** (`slotSelections.slotId` e `activityCheckIns.slotId` opzionali) — è il modello onesto, e l'abbiamo scartato per il prezzo misurato: `slotId` è FK obbligatoria in due tabelle, sostiene tre indici `by_slot` ed è letta in una ventina di punti fra capienza, check-in, export e cancellazione a cascata. Tutti da rendere null-safe. In più la [[Tolleranza check-in]] andrebbe riappoggiata a mano agli orari dell'Attività, ricostruendo esattamente ciò che lo Slot unico dà gratis: con una fascia 15–17 nessuno può timbrare la visita alle nove del mattino.
- **Nessun flag, la UI si adatta quando l'Attività ha un solo Slot** — scartata: la regola sarebbe implicita e sbagliata a sorpresa. Un admin che crea un aperitivo di un'ora con slot da un'ora si ritroverebbe un «mi interessa / non mi interessa» che non ha chiesto, e i suoi cinquanta posti sparirebbero dalla vista pur restando applicati: al cinquantunesimo iscritto la prenotazione fallirebbe senza che il form ne avesse mai parlato.
- **Non modellarlo affatto** (Evento senza Attività, visita descritta nella descrizione) — scartata dopo averla scelta: risolve la tendina ma perde il conteggio degli interessati, che è metà della richiesta. Sono due cose diverse.
- **Tetto di posti opzionale anche sull'accesso libero** — scartata: «accesso libero» dice già tutto, e un tetto trasformerebbe il «Mi interessa» in una richiesta rifiutabile a esaurimento. Peggio, per la [[Regola di capacità (atomica)]] il rifiuto farebbe cadere l'intera Prenotazione, famiglia compresa, per una visita facoltativa.

## Consequences

- L'aggregazione di capienza in `model.ts` somma `s.capacity`: con `null` produrrebbe `NaN`, e `soldOut` è guardato su `allSlots.length > 0`, quindi un Evento di sola visita libera si annuncerebbe «Esaurito». Entrambi vanno ristretti agli Slot con tetto.
- Il dettaglio admin ha già il ramo «Illimitati»: la sua condizione passa da «nessuna Attività» a «nessuno Slot con tetto».
- Quando **tutte** le Attività di un Evento sono ad accesso libero, il form non rende l'intestazione «Attività» né il suggerimento di policy: restano i soli blocchi, come per l'Evento senza Attività dell'ADR `0010`.
- La [[Regola di capacità (atomica)]] salta gli Slot senza tetto anziché confrontarli con zero.
- Gli Eventi e le Attività esistenti non sono toccati: il flag è assente di default e assente significa il comportamento odierno.
