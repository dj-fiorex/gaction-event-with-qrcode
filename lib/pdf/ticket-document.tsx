import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { CATEGORY_LABEL } from '../person-labels'
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
  return (
    <Page size="A4" wrap={false} style={styles.page}>
      {event.coverDataUrl ? <Image style={styles.cover} src={event.coverDataUrl} /> : null}
      <View style={styles.header}>
        <Text style={styles.eventTitle}>{event.title}</Text>
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
