/**
 * Feature flag lette da variabili d'ambiente pubbliche.
 *
 * Nota: Next.js sostituisce `process.env.NEXT_PUBLIC_*` a build time nei bundle
 * client, quindi una modifica alla variabile richiede una nuova build/deploy.
 */

/**
 * Quando `NEXT_PUBLIC_DISABLE_EVENT_CREATION` vale `true`, la creazione di nuovi
 * eventi è disabilitata: il pulsante «Nuovo evento» viene nascosto e la pagina
 * `/admin/new` reindirizza alla dashboard.
 */
export const eventCreationDisabled =
  process.env.NEXT_PUBLIC_DISABLE_EVENT_CREATION === 'true'
