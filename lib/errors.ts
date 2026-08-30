/**
 * Messaggio utente a partire da un errore sollevato da una funzione Convex.
 *
 * Il client Convex costruisce `error.message` come
 * `[CONVEX M(path)] <messaggio>\n  Called by client`: non è mai un testo
 * mostrabile, nemmeno per un `ConvexError`. Il messaggio pulito viaggia solo
 * in `error.data`, che il client valorizza dal payload del server.
 *
 * In più, i messaggi di un `Error` semplice sono oscurati in produzione
 * («Server Error»), mentre `data` di un `ConvexError` arriva al client in
 * dev e in produzione. Per questo in `convex/` si solleva sempre
 * `ConvexError(messaggio)` e mai `Error`.
 *
 * Senza `data` — errore interno inatteso, rete, o un throw non convertito —
 * si usa il `fallback` della schermata chiamante.
 */
export function messageFromError(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null | undefined)?.data
  return typeof data === 'string' && data.trim() !== '' ? data : fallback
}
