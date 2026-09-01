import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { CATEGORY_LABEL } from '../person-labels'
import { resolveTicketHeader, type TicketHeader } from './ticket-header'
import { fullName } from '../person-name'
import type { RegisteredPerson } from '../types'

/** Dati dell'Evento mostrati nell'header di ogni pagina biglietto. */
export interface TicketPdfEvent {
  title: string
  location: string
  /** Data/intervallo già formattato per la visualizzazione (es. output di formatDateRange). */
  dateRange: string
  /** URL remoto dell'immagine di copertina (input); risolto in coverDataUrl prima del render. */
  imageUrl?: string | null
  /**
   * Immagine di copertina come data URL base64. react-pdf carica le immagini via XHR e
   * richiede header CORS, quindi la copertina va incorporata come data URL, non come URL remoto.
   */
  coverDataUrl?: string
  /**
   * Intestazione del Biglietto scelta sull'Evento. Non è opzionale di
   * proposito: i punti che costruiscono questo oggetto sono cinque, fra
   * browser e server, e uno che se ne dimenticasse in silenzio farebbe
   * divergere il biglietto scaricato da quello spedito — proprio ciò che
   * l'ADR 0015 tiene insieme.
   */
  ticketHeader: TicketHeader
}

const palette = {
  primary: '#3358c4',
  foreground: '#242424',
  muted: '#75767f',
  border: '#e2e3e8',
}

const styles = StyleSheet.create({
  page: {
    paddingVertical: 56,
    paddingHorizontal: 56,
    fontSize: 12,
    color: palette.foreground,
    fontFamily: 'Helvetica',
    flexDirection: 'column',
  },
  cover: {
    width: 320,
    height: 180,
    objectFit: 'cover',
    borderRadius: 6,
    marginBottom: 20,
    alignSelf: 'center',
  },
  /**
   * L'Immagine dell'Evento nello slot del titolo: 16:9 a 128×72 pt (≈4,5 cm),
   * lo stesso ingombro verticale di due righe di titolo, allineata a sinistra
   * come il titolo che sostituisce. `contain` e non `cover` perché un'immagine
   * che il ritaglio non ha portato esattamente a 16:9 va rimpicciolita, non
   * tagliata: qui è un marchio, non una copertina.
   */
  headerImage: {
    width: 128,
    height: 72,
    objectFit: 'contain',
    alignSelf: 'flex-start',
  },
  header: {
    marginBottom: 28,
  },
  eventTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 24,
    color: palette.primary,
  },
  rule: {
    marginTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    fontSize: 11,
    color: palette.muted,
  },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: {
    width: 200,
    height: 200,
  },
  personName: {
    marginTop: 28,
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
  },
  category: {
    marginTop: 6,
    fontSize: 12,
    color: palette.muted,
  },
  codeBox: {
    marginTop: 28,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.muted,
  },
  code: {
    marginTop: 6,
    fontFamily: 'Courier-Bold',
    fontSize: 18,
    letterSpacing: 4,
  },
  footer: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 10,
    color: palette.muted,
  },
})

function personSubtitle(person: RegisteredPerson): string {
  const label = CATEGORY_LABEL[person.category]
  if (person.category === 'child' && person.age != null) {
    return `${label} \u00b7 ${person.age} anni`
  }
  return label
}

function TicketPage({ person, event }: { person: RegisteredPerson; event: TicketPdfEvent }) {
  // Il ripiego si decide qui, dove si sa se l'immagine è davvero incorporabile
  // in *questo* render: la copertina che il browser ricodifica via canvas può
  // mancare al server, e viceversa.
  const cover = event.coverDataUrl
  const header = resolveTicketHeader(event.ticketHeader, Boolean(cover))
  return (
    <Page size="A4" wrap={false} style={styles.page}>
      {/* Con l'immagine in intestazione la copertina grande sparisce: sarebbe
          la stessa immagine due volte sullo stesso foglio. */}
      {header === 'title' && cover ? <Image style={styles.cover} src={cover} /> : null}
      <View style={styles.header}>
        {header === 'image' && cover ? (
          <Image style={styles.headerImage} src={cover} />
        ) : (
          <Text style={styles.eventTitle}>{event.title}</Text>
        )}
        <View style={styles.rule} />
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{event.dateRange}</Text>
          <Text style={styles.meta}>{event.location}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* qrDataUrl è un PNG data URL generato lato server. */}
        <Image style={styles.qr} src={person.qrDataUrl} />
        <Text style={styles.personName}>{fullName(person)}</Text>
        <Text style={styles.category}>{personSubtitle(person)}</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Codice biglietto</Text>
          <Text style={styles.code}>{person.ticketCode}</Text>
        </View>
      </View>

      <Text style={styles.footer}>Mostra questo QR code all&apos;ingresso.</Text>
    </Page>
  )
}

export function TicketsDocument({
  persons,
  event,
}: {
  persons: RegisteredPerson[]
  event: TicketPdfEvent
}) {
  return (
    <Document title={`Biglietti - ${event.title}`}>
      {persons.map((person) => (
        <TicketPage key={person.ticketCode} person={person} event={event} />
      ))}
    </Document>
  )
}
