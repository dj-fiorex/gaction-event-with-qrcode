'use client'

import { EmailmdBuilder } from '@emailmd/react'
import { useTheme } from 'next-themes'
import '@emailmd/react/styles.css'

interface EmailBodyEditorProps {
  /** Markdown del Testo dell'email di conferma. Vuoto = ripiego sul testo odierno. */
  value: string
  onChange: (markdown: string) => void
}

/**
 * Editor del Testo dell'email di conferma (issue #42): markdown a sinistra,
 * anteprima a destra resa da `emailmd` — lo stesso motore che rende l'email in
 * partenza, quindi il corpo si vede com'è, non attraverso una seconda
 * implementazione da tenere allineata. L'anteprima mostra il **corpo**: il
 * Riepilogo della Prenotazione viene aggiunto all'invio, quando le Persone
 * esistono.
 *
 * Vive in un modulo a sé perché il form lo carica con `next/dynamic` e
 * `ssr: false`: si porta dietro CodeMirror, `mjml-browser` e il proprio foglio
 * di stile, che restano fuori dal bundle di chi non apre il form di un Evento.
 */
export function EmailBodyEditor({ value, onChange }: EmailBodyEditorProps) {
  const { resolvedTheme } = useTheme()
  return (
    <EmailmdBuilder
      value={value}
      onChange={onChange}
      // Il corpo vive sull'Evento: niente bozze in localStorage che potrebbero
      // ricomparire sull'Evento sbagliato, e nessun link di condivisione.
      autoSave={false}
      share={false}
      colorScheme={resolvedTheme === 'dark' ? 'dark' : 'light'}
    />
  )
}
