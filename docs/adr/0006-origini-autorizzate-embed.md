# Origini Autorizzate per l'incorporamento

## Status

accepted

## Contesto e decisione

L'[[Incorporamento]] di un Evento è vincolato a un elenco di [[Origine Autorizzata|Origini Autorizzate]] deciso dall'admin per Evento, applicato come direttiva CSP `frame-ancestors` sulle pagine `/embed/eventi/<id>`.

L'elenco è però facile da leggere come un controllo d'accesso, e non lo è. `frame-ancestors` limita **solo l'incorniciamento**: la stessa pagina resta raggiungibile e pienamente utilizzabile aprendo l'URL direttamente, da qualunque rete e senza alcuna autorizzazione. Chiunque conosca l'id di un Evento può quindi vedere e inviare il form, indipendentemente dall'elenco. Un futuro lettore che consideri le Origini Autorizzate un confine di riservatezza vi riporrebbe una fiducia che non reggono.

Decisione: **mantenere** l'elenco per Evento, con la motivazione esplicita che protegge dal **clickjacking** e dall'**uso del marchio altrui** — impedisce che un terzo incornici il form sotto il proprio marchio per raccogliere nomi ed email, o presenti l'Evento di un cliente come proprio — e **non** dall'accesso al form.

## Considered Options

- **Rilassare a `embedEnabled` soltanto** (nessuna origine da configurare: incorniciamento libero quando l'Evento è abilitato, `frame-ancestors 'none'` quando non lo è) — scartata: elimina l'intera classe di errori di configurazione e il relativo attrito di supporto, ma rinuncia alla protezione dal clickjacking e al controllo del marchio, che restano il motivo per cui l'elenco esiste.
- **Modalità advisory prima dell'enforcement** (`Content-Security-Policy-Report-Only` finché l'admin non conferma che l'incorporamento funziona, poi enforcement) — scartata: non romperebbe mai un cliente in silenzio, ma introduce uno stato aggiuntivo per Evento e un flusso di conferma da mantenere, sproporzionato rispetto al numero di Eventi incorporati.
- **Assistenza nell'editor dell'admin** (accoppiamento automatico `www`/apex al salvataggio, pulsante per derivare l'origine del costruttore di siti) — scartata per ora: ridurrebbe gli errori di compilazione, ma la UI di configurazione dell'Evento non va toccata.

## Consequences

- Ogni nuovo sito ospitante richiede **almeno due** origini, non una: quella visibile al visitatore e quella intermedia del costruttore di siti. Autorizzare solo la prima non basta.
- Gli errori di compilazione dell'elenco **falliscono in silenzio**: il browser rifiuta di rendere l'iframe e nulla lo segnala sul sito ospitante. Per questo `embed.js` registra un `console.error` quando la pagina incorporata non dà segni di vita entro 5 secondi, indicando l'origine da aggiungere. Il messaggio compare nella console del documento che ospita lo snippet — nei costruttori di siti un iframe annidato, da selezionare nei devtools.
- La riservatezza dell'Evento continua a dipendere dalla non divulgabilità del suo id, non dall'elenco. Un Evento che richieda un accesso effettivo va protetto con [[Prenotazione riservata agli account (requireAccount)]], non con le Origini Autorizzate.
- L'elenco resta facile da rilassare in seguito: la decisione è registrata per la motivazione, non perché sia costosa da invertire.
