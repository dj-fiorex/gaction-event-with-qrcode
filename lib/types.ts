export interface EventChildOption {
  /** Se true, in fase di registrazione è possibile associare dei bambini. */
  allowChildren: boolean
  /** Numero massimo di bambini associabili a una singola registrazione. */
  maxChildrenPerRegistration: number
}

export interface Event {
  id: string
  title: string
  description: string
  /** Data/ora dell'evento in formato ISO. */
  date: string
  location: string
  /** Numero massimo di posti (conteggia dipendenti + bambini). */
  capacity: number
  imageUrl: string
  childOptions: EventChildOption
  createdAt: string
}

export interface RegistrationChild {
  name: string
  age: number
}

export interface Registration {
  id: string
  eventId: string
  employeeName: string
  employeeEmail: string
  department: string
  children: RegistrationChild[]
  /** Codice univoco codificato nel QR del ticket. */
  ticketCode: string
  used: boolean
  usedAt: string | null
  createdAt: string
}

export interface EventWithStats extends Event {
  /** Posti occupati (dipendente + bambini per ogni registrazione). */
  seatsTaken: number
  seatsAvailable: number
  registrationsCount: number
}

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface TicketValidationResult {
  status: 'valid' | 'already-used' | 'not-found'
  registration?: Registration
  event?: Event
  usedAt?: string | null
}
