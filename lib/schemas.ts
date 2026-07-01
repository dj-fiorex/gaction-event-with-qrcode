import { z } from 'zod'

export const registrationChildSchema = z.object({
  name: z.string().trim().min(2, 'Inserisci il nome del bambino'),
  age: z
    .number({ message: 'Inserisci un\u2019età valida' })
    .int('L\u2019età deve essere un numero intero')
    .min(0, 'Età non valida')
    .max(17, 'L\u2019età deve essere inferiore a 18'),
})

export const registrationSchema = z.object({
  eventId: z.string().min(1),
  employeeName: z.string().trim().min(2, 'Inserisci nome e cognome'),
  employeeEmail: z.string().trim().email('Inserisci un\u2019email valida'),
  department: z.string().trim().min(2, 'Inserisci il reparto'),
  children: z.array(registrationChildSchema),
})

export type RegistrationInput = z.infer<typeof registrationSchema>

export const eventSchema = z.object({
  title: z.string().trim().min(3, 'Titolo troppo corto'),
  description: z.string().trim().min(10, 'Descrizione troppo corta'),
  date: z.string().min(1, 'Seleziona data e ora'),
  location: z.string().trim().min(2, 'Inserisci il luogo'),
  capacity: z.coerce
    .number({ message: 'Inserisci una capienza valida' })
    .int()
    .min(1, 'La capienza deve essere almeno 1'),
  allowChildren: z.boolean().default(false),
  maxChildrenPerRegistration: z.coerce.number().int().min(0).default(0),
})

export type EventInput = z.infer<typeof eventSchema>

export const loginSchema = z.object({
  email: z.string().trim().email('Email non valida'),
  password: z.string().min(1, 'Inserisci la password'),
})

export type LoginInput = z.infer<typeof loginSchema>
