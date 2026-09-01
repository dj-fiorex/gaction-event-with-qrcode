/**
 * Intestazione del Biglietto: cosa sta in cima a ogni pagina del PDF.
 *
 * `title` — il titolo dell'Evento sotto la copertina grande, la forma
 * predefinita. `image` — la sola Immagine dell'Evento, in piccolo e a
 * sinistra, al posto del titolo: per gli Eventi il cui marchio è l'immagine
 * stessa, dove il titolo scritto sotto è una ripetizione.
 */
export type TicketHeader = 'title' | 'image'

export const TICKET_HEADER_DEFAULT: TicketHeader = 'title'

/**
 * Cosa mostra *davvero* l'intestazione, noto se l'immagine è renderizzabile.
 *
 * Il ripiego è inderogabile e vale in ciascun renderer per conto suo: la
 * copertina può esserci nel PDF scaricato dal browser e mancare in quello che
 * il server allega all'email (formato non decodificabile, download fallito).
 * Senza immagine si torna al **titolo** — un biglietto senza intestazione non
 * direbbe a quale Evento appartiene, e non è uno stato che l'admin possa
 * ottenere scegliendo.
 */
export function resolveTicketHeader(
  choice: TicketHeader | undefined,
  hasCover: boolean,
): TicketHeader {
  return choice === 'image' && hasCover ? 'image' : TICKET_HEADER_DEFAULT
}
