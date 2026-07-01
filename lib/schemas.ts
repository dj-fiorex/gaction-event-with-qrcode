import { z } from 'zod'

/* ------------------------------------------------------------------ */
/* Evento + Attività (creazione lato admin)                            */
/* ------------------------------------------------------------------ */

export const activityInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Inserisci il nome dell\u2019attività'),
    start: z.string().min(1, 'Inserisci l\u2019inizio'),
    end: z.string().min(1, 'Inserisci la fine'),
    slotDurationMinutes: z.coerce
      .number({ message: 'Durata non valida' })
      .int()
      .min(5, 'La durata minima è 5 minuti'),
    capacityPerSlot: z.coerce
      .number({ message: 'Capienza non valida' })
      .int()
      .min(1, 'Almeno 1 posto per slot'),
  })
  .refine((a) => new Date(a.end).getTime() > new Date(a.start).getTime(), {
    message: 'La fine deve essere successiva all\u2019inizio',
    path: ['end'],
  })

export const eventSchema = z
  .object({
    title: z.string().trim().min(3, 'Titolo troppo corto'),
    description: z.string().trim().min(10, 'Descrizione troppo corta'),
    location: z.string().trim().min(2, 'Inserisci il luogo'),
    activityPolicy: z.enum(['all', 'min', 'free']),
    minActivities: z.coerce.number().int().min(0).default(0),
    allowOverlap: z.boolean().default(false),
    checkInToleranceMinutes: z.coerce
      .number({ message: 'Tolleranza non valida' })
      .int()
      .min(0)
      .default(15),
    allowChildren: z.boolean().default(false),
    maxChildrenPerRegistration: z.coerce.number().int().min(0).default(0),
    allowCompanions: z.boolean().default(false),
    maxCompanionsPerRegistration: z.coerce.number().int().min(0).default(0),
    activities: z.array(activityInputSchema).min(1, 'Aggiungi almeno un\u2019attività'),
  })
  .refine(
    (e) => e.activityPolicy !== 'min' || (e.minActivities >= 1 && e.minActivities <= e.activities.length),
    {
      message: 'Il minimo di attività deve essere tra 1 e il numero di attività',
      path: ['minActivities'],
    },
  )

export type ActivityInput = z.infer<typeof activityInputSchema>
export type EventInput = z.infer<typeof eventSchema>

/* ------------------------------------------------------------------ */
/* Registrazione (lato pubblico)                                       */
/* ------------------------------------------------------------------ */

export const childInputSchema = z.object({
  name: z.string().trim().min(2, 'Inserisci il nome del bambino'),
  age: z.coerce
    .number({ message: 'Inserisci un\u2019età valida' })
    .int('L\u2019età deve essere un numero intero')
    .min(0, 'Età non valida')
    .max(17, 'L\u2019età deve essere inferiore a 18'),
})

export const companionInputSchema = z.object({
  name: z.string().trim().min(2, 'Inserisci il nome dell\u2019accompagnatore'),
})

export const slotSelectionSchema = z.object({
  activityId: z.string().min(1),
  slotId: z.string().min(1),
})

export const registrationSchema = z.object({
  eventId: z.string().min(1),
  userName: z.string().trim().min(2, 'Inserisci nome e cognome'),
  contactEmail: z.string().trim().email('Inserisci un\u2019email valida'),
  children: z.array(childInputSchema).default([]),
  companions: z.array(companionInputSchema).default([]),
  selections: z.array(slotSelectionSchema).default([]),
})

export type ChildInput = z.infer<typeof childInputSchema>
export type CompanionInput = z.infer<typeof companionInputSchema>
export type RegistrationInput = z.infer<typeof registrationSchema>

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: z.string().trim().email('Email non valida'),
  password: z.string().min(1, 'Inserisci la password'),
})

export type LoginInput = z.infer<typeof loginSchema>
