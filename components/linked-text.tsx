import { Fragment } from 'react'
import { linkify } from '@/lib/result-content'

/**
 * Testo semplice in cui indirizzi e URL diventano link, senza wrapper: chi lo
 * usa mette il proprio `<p>` o `<div>` attorno.
 *
 * Serve nei punti dove un recapito arriva dentro una frase — la chiusura
 * dell'[[Esito della Prenotazione]] (ADR 0014) e i messaggi che nominano
 * l'[[E-mail dell'organizzatore]] (ADR 0023). Su un telefono, e a maggior
 * ragione dentro l'iframe dell'[[Incorporamento]], «scrivi a info@…» senza
 * link è un invito che obbliga a trascrivere a mano un indirizzo.
 *
 * Il link può anche avere parole proprie — `[informativa](https://…)` — ed è
 * la forma che chiede il [[Consenso all'informativa]] (ADR 0012), dove il
 * rimando sta dentro la frase accanto alla casella.
 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((segment, index) =>
        segment.kind === 'link' ? (
          <a
            key={index}
            href={segment.href}
            className="underline underline-offset-2"
            /* Il web esterno si apre in una scheda nuova: l'informativa si
               legge a form aperto, e nella stessa scheda — dentro l'iframe
               dell'Incorporamento, la stessa cosa vale per il frame — la
               visita porterebbe via quel che l'Utente ha già scritto. Un
               `mailto:` invece non naviga: `_blank` gli lascerebbe accanto
               una scheda vuota. */
            target={segment.href.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
          >
            {segment.text}
          </a>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}
