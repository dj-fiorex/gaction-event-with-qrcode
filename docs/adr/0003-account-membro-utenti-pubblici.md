# Account personali degli Utenti nella tabella `users` con ruolo `member`

## Status

accepted

## Contesto e decisione

Finora la tabella `users` (Convex Auth) conteneva **solo** account privilegiati (admin/staff) e l'auto-registrazione pubblica era **disabilitata** (`auth.ts` lancia un errore sul flow `signUp`, vedi ADR `0001`). Gli Utenti che prenotano un Evento erano **anonimi**: una riga `registrations` con `contactEmail` libera più delle `persons`, senza alcuna identità persistente.

Introduciamo gli **account personali** per gli Utenti pubblici (i **Membri**): registrazione via email, area personale con dati utente e Storico partecipazioni.

Decisione: **riusare la stessa tabella `users`** aggiungendo un terzo valore di ruolo `member`, invece di creare una tabella e uno stack di auth separati. L'auto-registrazione pubblica viene **riabilitata** ma **vincolata**: nel flow `signUp` il provider Password forza sempre `role: 'member'` e non legge **mai** il ruolo da input del client; admin e staff restano creabili solo da un admin via `createStaffAccount`. Le Prenotazioni fatte da un Membro loggato vengono collegate con FK esplicita `registrations.userId`; **nessun** collegamento per corrispondenza di email.

## Considered Options

- **Tabella `members` separata con provider di auth dedicato** — scartata: raddoppia lo stack di auth (sessioni, `me`, `getAuthUserId` che dovrebbero ramificare per tipo di attore) per ottenere una separazione dei privilegi già garantibile dal solo `role`.
- **Collegamento dello Storico per `contactEmail`** — scartata: `contactEmail` è testo **non verificato**; un match automatico esporrebbe la Prenotazione di uno sconosciuto (e i nomi dei suoi Figli) nello Storico di chiunque digiti la stessa email.
- **Login unico account-obbligatorio per tutti gli Eventi** — scartata: uccide la registrazione anonima e il flusso embed su siti terzi, e orfaneggia le registrazioni esistenti. La scelta account-sì/no diventa invece un flag **per Evento** (`requireAccount`).

## Consequences

- `auth.ts` non blocca più `signUp`, ma lo **fissa** a `role: 'member'`: qualunque percorso di signup capace di produrre `admin`/`staff` è un **bug di sicurezza**.
- Il fallback `role ?? 'staff'` presente in `accounts.ts` diventa un **bordo tagliente**: un Membro deve avere `role: 'member'` **scritto esplicitamente**, mai assente, altrimenti verrebbe trattato come staff.
- `accounts.list` (gestione staff, solo admin) va **filtrata** per escludere i Membri, così la UI di gestione operatori non viene invasa dagli account pubblici.
- Schema: `users.role` → `admin | staff | member`; nuovo `registrations.userId` (opzionale) con indice `by_user`; nuovo `events.requireAccount` (opzionale).
- La **verifica email è obbligatoria** per i Membri e blocca la prenotazione su Eventi `requireAccount` finché non completata; admin/staff restano esenti (nascono pre-fidati).
- Il provider Password espone anche il **reset password** ("password dimenticata") via email (stesso stack Resend della verifica): un Membro può recuperare l'accesso da solo, dato che la cancellazione self-service è fuori scope.
- Le query dello Storico devono **autorizzare sul solo** `getAuthUserId` del chiamante: un Membro vede esclusivamente le proprie Prenotazioni.
- La UI di login diventa **unica e instradata per ruolo** (`member → /profilo`, `staff → /staff`, `admin → /admin`); il signup è riservato ai Membri.
