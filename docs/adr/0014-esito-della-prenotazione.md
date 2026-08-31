# Esito della Prenotazione: testo dell'Evento, visibilità dell'Incorporamento

## Status

accepted

## Contesto e decisione

Il committente ha riletto la schermata che segue una Prenotazione e ha chiesto altre parole: un ringraziamento con la data, l'avviso che l'email è partita e dove cercarla se non arriva, un invito a scaricare il PDF, un commiato. Ha chiesto anche di poter togliere i QR code dalla schermata dentro il suo sito, e il bottone «Nuova registrazione».

Quel testo contiene tre fatti che sono suoi e non nostri — «il 26 settembre», «alle 15.00», `info@maestridacciaio.it` — e una voce che è sua: «Sarà una giornata speciale. Per tutti noi!». Scritto nel codice, mentirebbe su tutti e tre i fatti al primo Evento successivo, e su un'assemblea suonerebbe fuori posto.

Decidiamo quindi di introdurre l'[[Esito della Prenotazione]] come **testo dell'[[Evento]]** — `resultTitle`, `resultBody`, `resultClosing` — e la sua **visibilità** come proprietà dell'[[Incorporamento]] — `embedShowTickets`, `embedShowNewRegistration`, accanto a `embedShowTitle` e `embedShowLocation`.

**L'asimmetria è deliberata e questo ADR esiste soprattutto per difenderla**: un lettore trova le parole su un'entità e i due interruttori su un'altra, a due file di distanza, e la prima tentazione è «sistemare» spostando tutto da una parte sola.

Le conseguenze scelte esplicitamente:

- **Il testo vale ovunque, gli interruttori solo dentro l'iframe.** Le parole parlano al partecipante di *quell'*Evento, e la Prenotazione si conclude allo stesso modo sulla pagina pubblica e nel form incorporato. La visibilità no: quattro QR code fanno un riquadro alto ~2000px che il `ResizeObserver` fa crescere dentro la pagina di qualcun altro, ed è una forza dell'iframe, la stessa di `embedShowTitle`.
- **`embedShowNewRegistration` sta sull'Incorporamento pur non avendo una forza dell'iframe.** La sua ragione è [[Una sola risposta per email]]: quel bottone riapre un form che, con la stessa email, il server rifiuterà. È un vicolo cieco tanto nell'iframe quanto sulla nostra pagina. Vive lì perché l'embed è per costruzione la superficie rivolta al visitatore, mentre la pagina pubblica è anche quella che l'organizzatore apre al banco accoglienza. Se un domani quella distinzione non regge, promuoverlo a impostazione dell'Evento è una migrazione di un campo, non un cambio di modello.
- **Il bottone di download non è spegnibile.** Con la griglia dei biglietti via, quel PDF è l'unica presa che resta a chi non riceve l'email. Un interruttore che potesse toglierlo renderebbe raggiungibile uno stato in cui l'Utente esce dalla schermata senza niente in mano.
- **Ripiego indipendente per campo**, non «tutti o nessuno». Il tutto-o-niente dell'[[Aspetto dell'Incorporamento]] (ADR `0013`) non è un principio generale del progetto: è la conseguenza del fatto che quei sei valori entrano in un *calcolo* — contrasto e token derivati — che un insieme parziale renderebbe indefinito. Qui sono tre stringhe indipendenti in tre punti diversi della pagina, e il precedente giusto è l'altro: oggetto e corpo dell'email ripiegano ciascuno per conto proprio. Così l'uso più probabile — scrivere **solo la chiusura** e lasciare il resto com'era — resta una sola modifica.
- **La chiusura non ha ripiego.** È un blocco che oggi non esiste, quindi il suo «comportamento odierno» è l'assenza, non una frase da inventare.
- **Il corpo di ripiego cambia frase con i biglietti.** Acceso: «…Scarica il PDF di riepilogo o quello singolo», identico a oggi. Spento: «…Scarica il PDF dei biglietti», perché i bottoni per Persona non esistono più e indicarli sarebbe falso. È la stessa regola, e per la stessa ragione, che `defaultEmailBody` applica già a `hasPdf`.
- **Testo semplice, non markdown.** Vedi sotto: è il compromesso meno ovvio dei due.
- **I tre campi sono pubblici**, a differenza di `emailSubject`/`emailBody` che il DTO espone solo agli operatori. Li rende il form a chiunque prenoti, embed compreso, e non rivelano nulla che non sia già visibile iscrivendosi.
- **Sparisce la riga «Evento: *titolo*»** in coda alla schermata. Era ridondante sulla pagina pubblica — il titolo è già l'`h1` sopra il form — e si contraddiceva nell'embed: con `embedShowTitle` spento nascondevamo il titolo in cima perché «il sito ospitante lo dice già lui», e poi lo ristampavamo in fondo.

## Considered Options

- **Scrivere la copy del committente nel codice.** Scartata: date, indirizzo e voce sono suoi. Con i pezzi variabili derivati (data dalla [[Data dell'Evento]], contatto da un campo nuovo) resterebbe comunque impossibile esprimere la chiusura che ha chiesto, e la [[Data dell'Evento]] può legittimamente mancare.
- **Markdown, come il [[Testo dell'email di conferma]].** Scartata su un fatto: l'unico motore in casa è `emailmd`, che rende *email* (MJML). Per la UI servirebbe una dipendenza nuova — `react-markdown` più una sanificazione — che finirebbe **anche nel bundle dell'iframe**, servito su siti di terzi, per ottenere grassetti che nessuno ha chiesto. L'ADR `0007` scelse il markdown per l'email per due ragioni che qui non valgono nessuna delle due: quel testo ha bisogno di titoli ed elenchi, e il motore era già lì perché è lo stesso che compone il messaggio. Il bisogno reale qui è «vai a capo», più gli indirizzi cliccabili — che risolviamo con un autolink di una decina di righe.
- **Un solo campo di testo invece di tre.** Scartata perché il **bottone sta in mezzo**: il committente mette il corpo sopra, l'invito attaccato al bottone e il commiato sotto. Un blob unico non sa dire «e qui c'è il bottone». L'invito finisce nell'ultima riga del corpo — «scarica **qui** il PDF» funziona proprio perché precede il bottone.
- **Rendere configurabile anche l'etichetta del bottone.** Scartata: un admin che ci scrive un paragrafo ottiene un bottone largo come la pagina, e a differenza di un'email storta questo lo vede solo l'Utente finale. Il titolo resta invece un campo a sé, e non una riga del corpo, per la ragione dell'ADR `0007` sull'oggetto: è un elemento strutturale, non prosa che possa sparire per una riga vuota di troppo.
- **Nascondere i QR ma tenere i `ticketCode` in elenco.** Tecnicamente difendibile — lo scanner ha una modalità «Codice manuale», quindi il codice da solo è un pass funzionante — ma scartata: introdurrebbe un terzo stato («i biglietti ci sono a metà») e quel ripiego non si scopre leggendo la schermata, si scopre **al varco**, quando l'addetto deve digitare a mano quattro codici da un telefono.
- **Un booleano anche per la riga «Evento: *titolo*».** Scartata: un interruttore si aggiunge quando esistono due usi legittimi in tensione, e qui quella riga non dice nulla che il contesto non dica già, su nessuna delle due superfici.

## Consequences

- I ripieghi vivono in `lib/result-content.ts`, modulo puro come `lib/email-content.ts`, e non dentro `TicketResult`. La regola che sceglie *quali parole* legge l'Utente si rompe in silenzio — una promessa falsa non solleva eccezioni — quindi deve essere verificabile con un `expect` e non montando la UI.
- L'ordine della schermata è titolo → corpo → download → biglietti → chiusura → «Nuova registrazione», e non è arbitrario: la chiusura è un commiato e non le va sotto una griglia di QR; il bottone di servizio le va sotto senza stonare. Soprattutto, **spegnere i due blocchi non scompone nulla** — la chiusura resta l'ultima cosa in entrambi gli stati.
- L'autolink accetta solo `http(s)` e `mailto:`, e pretende un dominio **con almeno un punto**: senza quel vincolo «@luca» diventerebbe un `mailto:` rotto. La punteggiatura che chiude la frase resta fuori dal link.
- Gli a capo singoli sopravvivono dentro il paragrafo (`whitespace-pre-line`): chi scrive un indirizzo su tre righe ottiene tre righe senza imparare una sintassi.
- Il pannello dell'admin si divide di conseguenza: i tre testi nel form dell'Evento (`fieldset` «Esito della prenotazione», **prima** di «Email di conferma», che è l'ordine in cui le due cose accadono all'Utente), i due interruttori nella `EmbedCard`. Nessuna anteprima, a differenza dell'email: il markdown non si vede mentre lo si scrive, il testo semplice sì — la textarea *è* l'anteprima.
- Il testo dice quel che l'admin gli fa dire, **anche quando l'email non parte**. L'invio resta *fire-and-forget* con l'esito `{ delivered, simulated }` ignorato, quindi un corpo che promette l'email e manda a controllare lo spam può risultare falso. La rete di sicurezza è il bottone di download, incondizionato. Renderlo visibile è un lavoro a sé, deliberatamente fuori da questo ADR.
