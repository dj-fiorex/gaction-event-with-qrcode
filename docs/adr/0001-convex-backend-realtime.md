# Convex come backend con architettura realtime ibrida

## Status

accepted

## Contesto e decisione

L'app usava un backend mock in-memory (`lib/db.ts` + `lib/seed.ts`), Server Actions, query server-only e auth a cookie con due ruoli condivisi fissi. Adottiamo **Convex** come backend persistente per ottenere query realtime gratuite (le sottoscrizioni `useQuery` si aggiornano da sole) e **Convex Auth** (Password provider) per account per-utente reali con ruolo (`admin` | `staff`).

L'accesso ai dati diventa **ibrido**: le viste che devono essere realtime (monitor attività, liste check-in, disponibilità slot) e tutte le scritture (check-in, registrazione, CRUD admin) passano dal `ConvexReactClient` (`useQuery`/`useMutation`) lato client; le pagine puramente statiche restano RSC.

## Considered Options

- **Convex dietro le Server Actions** — scartata: mantenere Server Actions che chiamano Convex via HTTP client perde le sottoscrizioni realtime, che sono il motivo principale dell'adozione.
- **Full client-side ovunque** — scartata: riscrittura più ampia del necessario e perdita di RSC dove non serve realtime.

## Consequences

- Il backend mock (`db.ts`, `queries.ts`, `actions.ts`, `seed.ts`) e l'auth a cookie (`auth.ts`) vengono rimossi; le utility pure (`slots.ts`, `format.ts`, `qr.ts`, `export.ts`, `schemas.ts`, `email.ts`, `pdf/`) restano e vengono richiamate da Convex o dal client.
- Convex richiede un deployment reale con env vars `NEXT_PUBLIC_CONVEX_URL` e `CONVEX_DEPLOYMENT`; senza deployment collegato la preview non ha dati.
- Nessuna auto-registrazione pubblica: il primo admin nasce da una mutation di seed una-tantum, gli account Assistente li crea l'admin dalla dashboard.
- Le mutation di check-in sono transazionali e ritornano un esito tipizzato (`ok` | `gia_registrato` | `slot_pieno` | `fuori_orario` | `non_autorizzato`) per evitare doppi check-in e overbooking.
- L'accesso allo scan resta duale a livello di Evento: modalità `private` (Assistenti associati, autenticati) oppure `password` (chiunque abbia la password).
