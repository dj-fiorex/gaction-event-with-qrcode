# Immagine dell'Evento su Convex file storage con crop 16:9

## Status

accepted

## Contesto e decisione

Un Evento deve poter avere un'immagine (hero della pagina pubblica `/eventi/[id]` e copertina nella `EventCard`), entrambe renderizzate in un frame `aspect-[16/9]`. Prima il campo `imageUrl` era un `v.string()` **obbligatorio** hardcodato a `/events/generic-event.png` in `events.create`, mai valorizzato dall'admin: di fatto morto.

Decidiamo di:

- Sostituire `imageUrl` nello schema con **`imageStorageId: v.optional(v.id("_storage"))`**. L'immagine è **opzionale**: un Evento può non averla.
- Usare **Convex file storage** per i byte (nessuna nuova integrazione, nessuna env var, cascade con l'Evento).
- Far **caricare all'admin** l'immagine ritagliata client-side con **react-easy-crop** bloccato a **16:9**, output ridimensionato a max ~1600px di larghezza e ricodificato (WebP/JPEG ~0.85) prima dell'upload, così i blob restano piccoli.
- Il DTO risolve `imageStorageId` via `ctx.storage.getUrl()` e continua a esporre il campo come **`imageUrl` (string | null)**: i due render site restano invariati e usano il fallback statico quando è `null`.

## Considered Options

- **Vercel Blob** — scartata: introduce una nuova integrazione + env var per un bisogno già coperto nativamente da Convex.
- **Solo URL esterno** (paste di un link nel vecchio campo string) — scartata: niente hosting garantito né crop, vanifica react-easy-crop.
- **Scrivere l'URL di storage risolto dentro `imageUrl`** — scartata: gli URL di Convex storage non sono garantiti permanenti, i link marcirebbero. Si conserva lo `storageId` e si risolve a ogni richiesta.
- **`imageStorageId` obbligatorio** — scartata: un Evento deve poter esistere senza immagine.
- **Nessun crop (solo `object-cover`)** — scartata: l'admin non controllerebbe l'inquadratura e si caricherebbero originali enormi.
- **Migrazione widen→migrate→narrow / `@convex-dev/migrations`** — non necessaria: tutti gli Eventi esistenti sono stati cancellati, quindi nessun documento porta il vecchio campo obbligatorio e lo schema può essere ristretto direttamente.

## Consequences

- Nuova mutation `events.generateUploadUrl` (solo admin/operatore) per ottenere l'URL di upload; il client fa il POST del blob ritagliato e passa lo `storageId` risultante a `events.create` / `events.update`.
- `events.update` deve poter aggiornare o rimuovere l'immagine; alla sostituzione/rimozione va cancellato il vecchio file (`ctx.storage.delete`) per non lasciare orfani. Anche l'eliminazione di un Evento deve cancellare il file associato.
- `event-form.tsx` (react-hook-form + zod) aggiunge un campo immagine con cropper; lo schema zod in `lib/schemas.ts` tratta lo `storageId` come opzionale.
- Nessuna migrazione dati richiesta (Eventi azzerati). Il vecchio asset `/events/generic-event.png` resta come fallback di rendering.
