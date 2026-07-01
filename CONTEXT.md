# Context — Glossary

## Ubiquitous Language

### Utente
Chi si iscrive a un Evento e gestisce la prenotazione. Un Utente è **sempre anche una Persona**: partecipa, occupa un posto e riceve un proprio QR code. Può portare altre Persone (Figli e Accompagnatori).

### Persona
Un partecipante fisico all'Evento. Occupa un posto e riceve **1 QR code**. NON è un account. Categorie di Persona:
- **Utente** — l'iscritto stesso (vedi sopra).
- **Figlio** — persona a carico portata dall'Utente. Ammessi solo se l'admin lo consente per l'Evento (con un massimo).
- **Accompagnatore** — persona adulta al seguito. Ammessi solo se l'admin lo consente per l'Evento (con un massimo).

### Evento
Un raduno a cui gli Utenti si iscrivono. Genera **1 QR code per ogni Persona** (non per Attività). L'admin configura per ogni Evento se sono ammessi Figli (con max) e se sono ammessi Accompagnatori (con max).

### Attività
Un segmento di un Evento con un **orario di inizio e fine** e un **numero di posti limitato proprio** (indipendente dagli altri). I posti si contano per singola Attività.

### Prenotazione
L'insieme delle Persone iscritte insieme da un Utente in un'unica operazione. La **selezione di Attività è unica per Prenotazione**: tutte le Persone della stessa Prenotazione partecipano allo stesso set di Attività. Ogni Persona occupa comunque 1 posto in ciascuna Attività selezionata.

### Policy di selezione Attività
Impostazione a livello di Evento decisa dall'admin in fase di creazione. Determina come la Prenotazione viene associata alle Attività:
- **Tutte obbligatorie** — la Prenotazione include tutte le Attività.
- **Minimo N** — la Prenotazione deve includere almeno N Attività.
- **Libera** — l'Utente sceglie liberamente quali Attività includere in fase di Registrazione.

### Regola di capacità (atomica)
Una Registrazione è **atomica**: se anche una sola Attività selezionata non ha posti liberi sufficienti per **tutte** le Persone della Prenotazione, l'intera Registrazione fallisce. Nessuna iscrizione parziale, nessuna famiglia divisa.

### QR code
Un codice univoco generato **1 per ogni Persona** (non per Attività). Vale come pass per tutte le Attività a cui quella Persona è iscritta.

### Staff (Operatore)
Ruolo dedicato alla scansione dei QR, separato dall'Admin, con accesso limitato alla sola interfaccia di scansione/check-in.

### Check-in
Atto di scansionare il QR di una Persona. Avviene:
1. **All'ingresso dell'Evento** — validazione generale.
2. **All'ingresso di ogni Attività** — verifica che la Persona sia iscritta a quell'Attività e che stia arrivando nella fascia oraria corretta (arrivo troppo in anticipo/fuori orario = bloccato).
