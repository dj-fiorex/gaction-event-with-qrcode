import { expect, test } from 'vitest'
import {
  DEFAULT_EMBED_THEME,
  EMBED_RADIUS_MAX,
  EMBED_TEXT_SCALE_MAX,
  EMBED_TEXT_SCALE_MIN,
  contrastRatio,
  embedThemeCssVars,
  normalizeHexColor,
  parseEmbedTheme,
  readableOn,
} from '../../lib/embed'

test('un esadecimale si normalizza comunque lo si incolli', () => {
  // Le forme che arrivano davvero da un manuale di brand.
  expect(normalizeHexColor('#E5007C')).toBe('#e5007c')
  expect(normalizeHexColor('e5007c')).toBe('#e5007c')
  expect(normalizeHexColor('  #28348A  ')).toBe('#28348a')
  expect(normalizeHexColor('#fff')).toBe('#ffffff')
})

test('le altre sintassi CSS sono rifiutate, non interpretate', () => {
  // Finiscono in color-mix() e nel calcolo del contrasto: servono componenti
  // numeriche certe, e «quasi valido» qui vuol dire un form illeggibile.
  for (const input of ['rgb(229, 0, 124)', 'magenta', '#12345', '', '#gggggg']) {
    expect(normalizeHexColor(input)).toBeNull()
  }
})

test('il contrasto è quello di WCAG', () => {
  expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
  expect(contrastRatio('#28348a', '#28348a')).toBeCloseTo(1, 5)
  // Il caso che ha originato la feature: blu del brand su bianco.
  expect(contrastRatio('#28348a', '#ffffff')).toBeGreaterThan(9)
})

test('il testo del bottone resta bianco quando il bianco basta', () => {
  // Sul magenta il massimo contrasto puro sceglierebbe il nero (4,62 contro
  // 4,54) e il bottone smetterebbe di somigliare a quello del sito ospitante.
  expect(contrastRatio('#e5007c', '#000000')).toBeGreaterThan(
    contrastRatio('#e5007c', '#ffffff'),
  )
  expect(readableOn('#e5007c')).toBe('#ffffff')
})

test('sotto la soglia AA il calcolo torna a comandare', () => {
  // Un giallo chiaro: col bianco non si legge, e la convenzione cede.
  expect(readableOn('#ffe14d')).toBe('#000000')
})

test('i valori fuori scala rientrano, i colori malformati si segnalano', () => {
  const { theme, invalid } = parseEmbedTheme({
    accent: '#e5007c',
    foreground: 'blu del brand',
    background: '#ffffff',
    fontStack: 'comic-sans',
    textScale: 900,
    radius: -5,
  })

  // Una scala del 900% non è un'opinione da rispettare: si riporta nel range.
  expect(theme.textScale).toBe(EMBED_TEXT_SCALE_MAX)
  expect(theme.radius).toBe(0)
  // Uno stack sconosciuto ripiega, un colore illeggibile no: è un dato digitato
  // che non possiamo indovinare, e chi ha scritto va avvisato.
  expect(theme.fontStack).toBe(DEFAULT_EMBED_THEME.fontStack)
  expect(invalid).toEqual(['testo'])
})

test('una scala troppo piccola rientra dal basso', () => {
  const { theme } = parseEmbedTheme({
    ...DEFAULT_EMBED_THEME,
    fontStack: DEFAULT_EMBED_THEME.fontStack,
    textScale: 5,
    radius: 999,
  })
  expect(theme.textScale).toBe(EMBED_TEXT_SCALE_MIN)
  expect(theme.radius).toBe(EMBED_RADIUS_MAX)
})

test('i token derivati nascono dai colori scelti, non da grigi fissi', () => {
  // È il punto dei sei valori: con un testo blu, bordi e testo attenuato
  // devono virare al blu, altrimenti il form resta di qualcun altro.
  const vars = embedThemeCssVars({
    ...DEFAULT_EMBED_THEME,
    accent: '#e5007c',
    foreground: '#28348a',
    background: '#ffffff',
  })

  expect(vars['--muted-foreground']).toContain('#28348a')
  expect(vars['--border']).toContain('#28348a')
  expect(vars['--primary']).toBe('#e5007c')
  expect(vars['--ring']).toBe('#e5007c')
  expect(vars['--primary-foreground']).toBe('#ffffff')
})

test('il rosso d’errore non è brandizzabile', () => {
  // Un committente col rosso in tavolozza non deve poter rendere
  // indistinguibile un messaggio di errore.
  const vars = embedThemeCssVars({ ...DEFAULT_EMBED_THEME, accent: '#cc0000' })
  expect(vars['--destructive']).toBeUndefined()
})

test('il raggio arriva ai token in px', () => {
  const vars = embedThemeCssVars({ ...DEFAULT_EMBED_THEME, radius: 0 })
  expect(vars['--radius']).toBe('0px')
})
