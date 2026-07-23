import type { PersonCategory } from './types'

/**
 * Etichette utente delle categorie di Persona, single source of truth per tutte
 * le superfici (form, email, biglietti PDF, scanner, admin, export).
 * CONTEXT.md: il termine corrente è «Ospite», non «Accompagnatore».
 */
export const CATEGORY_LABEL: Record<PersonCategory, string> = {
  user: 'Iscritto',
  child: 'Figlio',
  companion: 'Ospite',
}
