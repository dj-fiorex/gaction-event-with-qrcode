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
 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((segment, index) =>
        segment.kind === 'link' ? (
          <a key={index} href={segment.href} className="underline underline-offset-2" rel="noreferrer">
            {segment.text}
          </a>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  )
}
