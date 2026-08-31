/**
 * Consegna dell'email di conferma (ADR 0016): le regole pure attorno alla
 * tabella `emailDeliveries`.
 *
 * Vivono qui e non in `convex/` perché le legge anche la UI — l'icona in admin
 * e il conteggio sopra la tabella applicano la stessa soglia che il server usa
 * per interpretare una riga rimasta «in corso».
 */

/**
 * I cinque esiti di una Consegna. Restano allineati all'enum dello schema
 * (`convex/schema.ts`) e alla voce di CONTEXT.md.
 *
 * - `pending`   in corso: il tentativo è aperto, l'action non ha ancora chiuso
 * - `delivered` consegnata: **accettata dal provider**, non letta
 * - `rejected`  rifiutata: abbiamo chiesto, il provider ha detto no
 * - `failed`    non riuscita: non siamo riusciti nemmeno a chiedere
 * - `simulated` simulata: nessun provider configurato
 */
export type DeliveryOutcome = 'pending' | 'delivered' | 'rejected' | 'failed' | 'simulated'

/** Esiti terminali: una riga che li porta non cambierà più. */
export type TerminalOutcome = Exclude<DeliveryOutcome, 'pending'>

/**
 * Forma minima di un errore restituito dal provider. Il SDK Resend **non
 * lancia** sugli errori API: ritorna `{ data, error }`, ed è quel ramo che
 * distingue una consegna rifiutata da una non riuscita.
 */
export interface ProviderError {
  name?: string
  message?: string
}

/**
 * Com'è andato un tentativo di invio, nei termini in cui l'action lo osserva.
 *
 * - `no-provider`   `RESEND_API_KEY` assente: non abbiamo nemmeno provato
 * - `accepted`      il provider ha preso in carico l'email
 * - `provider-error` il provider ha *risposto* no (SDK Resend: `res.error`)
 * - `threw`         eccezione: rete, SDK, o il render del PDF
 */
export type SendAttempt =
  | { kind: 'no-provider' }
  | { kind: 'accepted' }
  | { kind: 'provider-error'; error: ProviderError | undefined }
  | { kind: 'threw'; error: unknown }

/** Come si chiude la riga `emailDeliveries`: esito e, dove serve, il motivo. */
export interface DeliveryClosure {
  outcome: TerminalOutcome
  reason?: string
}

/**
 * Traduce un tentativo nell'esito da scrivere sulla riga.
 *
 * È qui che «rifiutata» smette di essere «non riuscita» (ADR 0016). Un errore
 * *restituito* dal provider è un rifiuto: la richiesta è arrivata e la risposta
 * è no — di norma permanente (dominio non verificato, quota, sintassi), e
 * chiede di correggere qualcosa, non di ritentare. Un'eccezione dice invece che
 * non siamo riusciti nemmeno a chiedere, e lì ritentare identico ha senso. È
 * l'unica differenza pratica che questo enum compra, e cambia il consiglio che
 * il pannello dà.
 */
export function closureFor(attempt: SendAttempt): DeliveryClosure {
  switch (attempt.kind) {
    case 'accepted':
      return { outcome: 'delivered' }
    case 'no-provider':
      // Normale in sviluppo, guasto totale in produzione: per questo è un esito
      // suo e mostra comunque l'icona in admin.
      return { outcome: 'simulated', reason: 'RESEND_API_KEY non configurata' }
    case 'provider-error':
      return { outcome: 'rejected', reason: providerErrorReason(attempt.error) }
    case 'threw':
      return { outcome: 'failed', reason: truncateReason(String(attempt.error)) }
  }
}

/** Il motivo è diagnostica per l'admin, non un log: sta stretto. */
const MAX_REASON_LENGTH = 300

const REASON_MISSING = 'Rifiuto senza motivo dal provider'

function truncateReason(reason: string): string {
  return reason.length > MAX_REASON_LENGTH ? reason.slice(0, MAX_REASON_LENGTH) : reason
}

/**
 * Compone il motivo leggibile di un rifiuto. Un rifiuto senza motivo sarebbe
 * indistinguibile da un guasto nostro, quindi il campo non resta mai vuoto.
 */
export function providerErrorReason(error: ProviderError | undefined): string {
  const parts = [error?.name, error?.message].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  )
  const reason = parts.join(': ').trim()
  return reason.length === 0 ? REASON_MISSING : truncateReason(reason)
}

/**
 * Oltre questo tempo una Consegna ancora «in corso» è considerata sospetta.
 *
 * Con la pianificazione server-side dell'ADR `0015` un tentativo dura secondi:
 * può restare appeso solo se l'action muore a metà. La soglia vive **in
 * lettura** e non in un cron (ADR `0016`): nessuna riga viene patchata in uno
 * stato «abbandonata», che affermerebbe che il tentativo è finito male mentre
 * l'unica cosa che sappiamo è che non ne abbiamo più saputo nulla. Si cambia
 * con un deploy, senza toccare i dati.
 */
export const PENDING_STALE_MS = 2 * 60 * 1000

/** L'ultima Consegna di una Prenotazione, ridotta a ciò che decide l'icona. */
export interface DeliverySnapshot {
  outcome: DeliveryOutcome
  /** Istante di apertura del tentativo (`_creationTime` della riga). */
  startedAt: number
}

/**
 * Se la Consegna chiede attenzione all'admin.
 *
 * Una consegna riuscita non mostra niente: una tabella in cui ogni riga porta
 * una spunta verde insegna a ignorare la colonna. E l'assenza di righe non è
 * un allarme — le Prenotazioni anteriori a questo lavoro non ne hanno, per
 * scelta (nessun backfill).
 */
export function deliveryNeedsAttention(
  delivery: DeliverySnapshot | null | undefined,
  now: number,
): boolean {
  if (!delivery) return false
  if (delivery.outcome === 'delivered') return false
  if (delivery.outcome !== 'pending') return true
  return now - delivery.startedAt >= PENDING_STALE_MS
}
