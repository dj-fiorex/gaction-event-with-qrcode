# Gli errori del form pubblico si leggono accanto al bottone

## Status

accepted

## Contesto e decisione

Un'email già iscritta che riprovava a prenotare dall'[[Incorporamento]] vedeva **il nulla**: il bottone «Conferma registrazione» non produceva alcuna reazione visibile, e l'unica traccia era una riga `Server Error` nella console del browser. Il percorso d'errore però era corretto — la mutation sollevava un `ConvexError` con il messaggio giusto, il form lo catturava e chiamava `toast.error`, e il `<Toaster>` era montato. Il difetto era il **canale**.

Un toast è `position: fixed` rispetto al viewport del documento che lo rende. Dentro l'iframe quel documento è il form, e lo script di incorporamento ridimensiona l'iframe all'**altezza piena del contenuto** per non avere una barra di scorrimento interna. Le due cose insieme fanno sì che «in cima al viewport» significhi **in cima a tutto il form**: a scorrere è la pagina ospitante, l'iframe no, e il messaggio compare a migliaia di pixel sopra il bottone appena premuto. Nessuno risalirà mai a leggerlo.

Decisione: sulle superfici pubbliche l'errore si rende **dentro il form, accanto al controllo che lo riguarda** (`FormAlert`), e i toast d'errore spariscono. Vale su **entrambe** le superfici, pagina piena e Incorporamento, e su tutti i punti che vivono dentro l'iframe: i cinque del form pubblico — le tre risposte mancanti, l'invio della [[Prenotazione]], l'invio della [[Rinuncia]] — e i due dell'[[Esito della Prenotazione]], dove fallisce la generazione del PDF dei [[Biglietto|Biglietti]].

Ne discende una seconda scelta, meno ovvia: il bottone di invio usa **`aria-disabled` e non `disabled`**. Un bottone `disabled` è muto per costruzione — al click non succede nulla, che è esattamente il sintomo da cui questo ADR nasce — ed è saltato dalla navigazione da tastiera. Con `aria-disabled` resta cliccabile e raggiungibile, e le guardie nell'`onSubmit` scrivono il motivo subito sopra di esso. `disabled` vero sopravvive nel solo caso dell'invio in corso, dove un secondo click non ha davvero niente da dire.

## Considered Options

- **Inline solo dentro l'iframe, toast sulla pagina piena.** C'è un precedente per differenziare per superficie (ADR `0014`). Scartata: due percorsi d'errore, e questo bug è precisamente il tipo di cosa che si nasconde nel ramo meno frequentato. In più un toast svanisce da solo: anche fuori dall'iframe è perdibile da chi in quel momento guarda altrove.
- **Inline e toast insieme.** Scartata: lo stesso errore detto due volte a chi sta sulla pagina piena, e due superfici da tenere allineate per sempre.
- **Spostare il toast in basso, o insegnargli la posizione dello scorrimento della pagina ospitante.** Scartata: richiederebbe un canale `postMessage` in più solo per far galleggiare un avviso, e resterebbe fragile rispetto a com'è fatta la pagina di chi ci incorpora.
- **Mantenere `disabled` sul bottone.** Più semplice, ma reintroduce lo stesso silenzio in una forma diversa — e infatti i messaggi «Rispondi alla domanda sui figli minorenni» e «Rispondi a tutte le domande» erano già **irraggiungibili**: il bottone che avrebbe dovuto mostrarli era disabilitato proprio da quelle condizioni.

## Consequences

- **`toast.error` è vietato nel form pubblico e nell'Esito.** Chi in futuro ne aggiungesse uno lì non starebbe seguendo la convenzione del progetto: la starebbe rompendo in un punto dove il messaggio non si vedrà. Nel pannello admin i toast restano legittimi — non vivono dentro un iframe alto quanto il contenuto.
- **`toast.success` resta dov'era.** Il successo non ha questo problema: dopo l'invio il form è sostituito dall'Esito, che è contenuto vero e visibile. Anzi, il toast di «Registrazione completata» è stato tolto perché *ridondante*, non perché invisibile.
- **Le tre validazioni client-side tornano vive.** Passando ad `aria-disabled` il click arriva, le guardie scattano e i loro messaggi si leggono. Erano codice morto.
- **Il fuoco si sposta sul messaggio** dopo un invio rifiutato, non lo scorrimento: dentro l'iframe scorrere non servirebbe comunque, perché a scorrere è la pagina di qualcun altro.
- Nessun componente `alert` di shadcn è stato aggiunto: `FormAlert` è un blocco piccolo e locale al progetto, come già `RegistrationNotice`.
