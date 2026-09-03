/**
 * Trim + lowercase, solo per dedup dentro l'Evento (mai identity linking,
 * ADR 0003).
 *
 * Sta in `lib/` e non in `convex/model.ts` perché la usano tutte e due le
 * sponde: il server per applicare «Una sola risposta per email» (ADR 0005) e
 * il form per sapere se l'email che l'utente sta digitando è ancora quella già
 * risultata occupata (ADR 0022). Due copie divergerebbero, e divergerebbero in
 * silenzio — il bordo dove si romperebbero è uno spazio di troppo.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
