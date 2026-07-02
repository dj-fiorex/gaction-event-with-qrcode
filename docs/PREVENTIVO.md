# Preventivo — Piattaforma Eventi con Check-in QR

**Tipo di preventivo:** sviluppo ex-novo (stima come se l'applicazione fosse costruita da zero)
**Ambito:** sviluppo + messa online una-tantum. Non include canone ricorrente né project management/QA come voci separate (il testing è incluso nelle giornate di sviluppo).
**Tariffa di riferimento:** 500 € / giornata-uomo (mercato IT, senior full-stack)
**Stack:** Next.js 16 (App Router) · Convex (DB realtime + backend) · Convex Auth · Resend (email) · @react-pdf · React

---

## 1. Descrizione dell'applicazione

Piattaforma per la gestione di eventi con iscrizione online, generazione di QR code personali e check-in in loco. Il modello di dominio prevede:

- **Evento** → **Attività** (con orario e durata) → **Slot** a posti limitati generati automaticamente.
- **Prenotazione** di gruppo atomica: un Utente iscrive sé stesso + eventuali Figli e Accompagnatori, ognuno riceve **1 QR code**.
- **Check-in transazionale** all'ingresso dell'evento e di ogni attività, con controllo di slot, orario e tolleranza.
- Backend **realtime** con capacità e prevenzione di doppio check-in / overbooking a livello di transazione.

---

## 2. Stima analitica per area funzionale

| # | Area funzionale | Descrizione sintetica | Giornate |
|---|-----------------|-----------------------|:--------:|
| 1 | Analisi requisiti e modello di dominio | Glossario, entità, regole di capacità e policy | 2 |
| 2 | Setup progetto e infrastruttura | Next.js 16, Convex, ambienti, struttura, tooling | 3 |
| 3 | Schema dati e backend base | Eventi, attività, slot, prenotazioni, persone, staff, utenti + indici | 3 |
| 4 | Autenticazione e ruoli | Convex Auth (password), ruoli admin/staff, bootstrap primo admin, creazione staff, route guards | 4 |
| 5 | Gestione eventi (admin) | CRUD eventi, attività, generazione automatica slot, configurazioni (figli/accompagnatori, tolleranza, policy attività, sovrapposizioni) | 6 |
| 6 | Immagine di copertina | Upload + crop 16:9 client-side, storage, resize/ottimizzazione | 2 |
| 7 | Sito pubblico | Home eventi, pagina dettaglio evento | 3 |
| 8 | Form di registrazione | react-hook-form + zod, selezione slot, regole atomiche di capacità, figli/accompagnatori | 5 |
| 9 | Generazione QR | ticketCode opachi, QR client-side, lookup indicizzato | 2 |
| 10 | Check-in / scansione | Pagina scan, esiti tipizzati, mutation transazionali evento+attività, tolleranza, accessi private/password + token | 6 |
| 11 | Email transazionali | Invio biglietti con QR inline via Resend (action Node) | 2 |
| 12 | Export PDF biglietti | @react-pdf, banner copertina, un biglietto per pagina | 3 |
| 13 | Export XLSX iscrizioni | Esportazione tabellare dati registrazioni | 1 |
| 14 | Form embeddabile su siti terzi | Route embed, loader `embed.js`, auto-resize, allowed origins, CSP dinamica | 5 |
| 15 | Associazione staff–evento e pannello staff | Abilitazione operatori per evento, interfaccia scansione dedicata | 2 |
| 16 | Testing e hardening | Verifica flussi critici, edge case, bugfix | 4 |
| 17 | Deploy una-tantum | Messa in produzione Vercel + Convex, env, dominio, setup Resend | 2 |
| | **Totale** | | **55** |

---

## 3. Riepilogo economico

| Voce | Valore |
|------|-------:|
| Giornate stimate | 55 gg |
| Tariffa giornaliera | 500 € |
| **Totale sviluppo (stima puntuale)** | **27.500 €** |
| Forbice realistica (±10%) | **24.750 € – 30.250 €** |

Importi IVA esclusa.

---

## 4. Cosa è incluso

- Analisi, sviluppo full-stack e testing di tutte le funzionalità elencate.
- Messa online una-tantum su Vercel + Convex e configurazione dei servizi (dominio, email Resend).

## 5. Cosa NON è incluso (scorporabile a parte)

- Canone ricorrente di hosting, manutenzione e assistenza (Convex/Vercel/Resend + evolutive).
- Project management dedicato e reportistica formale.
- Sviluppi non elencati (es. pagamenti online, app mobile nativa, multi-lingua, area analytics avanzata).
- Costi di terze parti (dominio, piani a consumo dei servizi cloud).

## 6. Ipotesi e note

- Stima basata sull'analisi oggettiva delle funzionalità presenti nell'applicazione.
- Le giornate includono il testing dei flussi critici (capacità, doppio check-in, overbooking).
- Eventuali requisiti aggiuntivi emersi in corso d'opera sono soggetti a integrazione del preventivo.
