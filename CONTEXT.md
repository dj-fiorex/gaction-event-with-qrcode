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
Un segmento di un Evento con un **orario di inizio e fine** e un **numero di posti limitato proprio** (indipendente dagli altri). Ogni Persona può essere iscritta a specifiche Attività; i posti si contano per singola Attività.

### Policy di selezione Attività
Impostazione a livello di Evento decisa dall'admin in fase di creazione. Determina come ogni Persona viene associata alle Attività:
- **Tutte obbligatorie** — ogni Persona partecipa a tutte le Attività.
- **Minimo N** — ogni Persona deve scegliere almeno N Attività.
- **Libera** — ogni Persona sceglie liberamente quali Attività fare in fase di Registrazione.

### QR code
Un codice univoco generato **1 per ogni Persona** (non per Attività). Vale come pass per tutte le Attività a cui quella Persona è iscritta.
