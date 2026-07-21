# Rinuncia come concetto separato e annullamento solo via admin

## Status

accepted

## Contesto e decisione

Alcuni Eventi (es. eventi aziendali) devono registrare anche chi **non** partecipa. Con la nuova impostazione per-Evento **Conferma di partecipazione**, il form pubblico chiede prima «Confermi la partecipazione? sì/no»: il «no» produce una **Rinuncia** (nome + email).

Decisione: la Rinuncia vive in una **tabella dedicata** (`declines`), **non** come flag su `registrations`. Una Prenotazione resta per definizione «l'insieme delle Persone iscritte insieme» (CONTEXT.md): una riga senza Persone, senza posti e senza QR avrebbe costretto ogni lettura di `registrations` (DTO, capacità, export, monitor) a un caso speciale.

Regole di coerenza per email (per Evento):

- «no» dopo «no» → **upsert** della Rinuncia (l'ultima vince).
- «sì» dopo «no» → la Prenotazione **cancella** la Rinuncia corrispondente.
- «no» dopo «sì» → **bloccato** sul form pubblico («Risulti già iscritto — contatta l'organizzatore»). L'annullamento di una Prenotazione esistente è un'azione **solo admin** (nuova mutation che elimina Prenotazione, Persone e selezioni, liberando i posti).

## Considered Options

- **Flag `declined` su `registrations`** — scartata: contraddice il glossario (Prenotazione senza Persone) e sparge esclusioni in ogni query esistente.
- **Auto-annullamento su «no»** — scartata per sicurezza: il form è **non autenticato**; chiunque conosca l'email di un collega potrebbe cancellargli la Prenotazione della famiglia. Il percorso distruttivo resta dietro l'auth admin.

## Consequences

- Il confronto per email tra Rinunce e Prenotazioni usa `contactEmail` normalizzata (trim + lowercase) **solo come dedup dentro il singolo Evento**, mai come collegamento di identità (coerente con ADR 0003).
- Il blocco «no» dopo «sì» rivela a un estraneo che un'email è iscritta all'Evento (minor information leak, accettato per eventi aziendali).
- Serve la nuova azione admin di **Annullamento della Prenotazione** (prima non esisteva alcuna cancellazione per singola Prenotazione), che è anche il rimedio operativo indicato dal messaggio di blocco.
