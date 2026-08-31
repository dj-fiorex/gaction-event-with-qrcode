import { v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import { internal } from './_generated/api'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { emailDeliveryOutcome } from './schema'
import type { DeliverySnapshot } from '../lib/email-delivery'

/**
 * Consegna dell'email di conferma (ADR 0016).
 *
 * Vive fuori da `emails.ts` perché quel modulo è `'use node'` e può esportare
 * solo action: la mutation che chiude la riga deve stare in un file che gira
 * nel runtime Convex, dove `ctx.db` esiste.
 */

/**
 * Apre una Consegna «in corso» e pianifica l'invio, in un gesto solo.
 *
 * È una funzione e non una mutation apposta: chi la chiama
 * (`registrations.register`, `registrations.resendTickets`) la esegue **dentro
 * la propria transazione**, così o commitano insieme la Prenotazione, la riga e
 * la pianificazione, o non commita nessuna delle tre. È l'invariante centrale
 * dell'ADR `0015`: «l'email non è mai partita perché il client non è tornato»
 * smette di essere una categoria di guasto.
 *
 * Le due scritture stanno qui insieme e non nei chiamanti perché l'invariante
 * vive nel **paio**: una riga aperta senza pianificazione resta «in corso» per
 * sempre, una pianificazione senza riga non ha dove scrivere l'esito.
 */
export async function enqueueConfirmationEmail(
  ctx: MutationCtx,
  args: { registrationId: Id<'registrations'>; recipient: string },
): Promise<Id<'emailDeliveries'>> {
  const deliveryId = await ctx.db.insert('emailDeliveries', {
    registrationId: args.registrationId,
    recipient: args.recipient,
    outcome: 'pending',
  })
  // Il destinatario viaggia con la pianificazione: l'action non lo rilegge
  // dalla Prenotazione, altrimenti un Reinvio che corregge `contactEmail`
  // mentre l'invio è in volo lo manderebbe altrove e la riga direbbe il falso.
  await ctx.scheduler.runAfter(0, internal.emails.sendTickets, {
    registrationId: args.registrationId,
    deliveryId,
    recipient: args.recipient,
  })
  return deliveryId
}

/**
 * Cancella le Consegne di una Prenotazione. Chiamata dall'Annullamento della
 * Prenotazione: la riga porta un indirizzo email, e un dato personale non deve
 * sopravvivere alla riga che lo giustificava (ADR `0016`).
 */
export async function deleteDeliveriesOfRegistration(
  ctx: MutationCtx,
  registrationId: Id<'registrations'>,
): Promise<void> {
  const deliveries = await ctx.db
    .query('emailDeliveries')
    .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
    .collect()
  for (const delivery of deliveries) await ctx.db.delete(delivery._id)
}

/** L'ultima Consegna aperta per una Prenotazione, o null se non ce ne sono. */
export async function latestDelivery(
  ctx: QueryCtx,
  registrationId: Id<'registrations'>,
): Promise<Doc<'emailDeliveries'> | null> {
  return ctx.db
    .query('emailDeliveries')
    .withIndex('by_registration', (q) => q.eq('registrationId', registrationId))
    .order('desc')
    .first()
}

/** Riduce una riga a ciò che decide l'icona in admin (`lib/email-delivery.ts`). */
export function toDeliverySnapshot(
  delivery: Doc<'emailDeliveries'> | null,
): DeliverySnapshot | null {
  if (!delivery) return null
  return { outcome: delivery.outcome, startedAt: delivery._creationTime }
}

/**
 * Chiude una Consegna con il suo esito, appena il provider risponde.
 *
 * La chiama `emails.sendTickets` via `ctx.runMutation`: un'action non ha
 * `ctx.db`. Se l'action muore prima di arrivare qui la riga resta «in corso»,
 * e a dirlo è la soglia in lettura — non un cron che scriverebbe «abbandonata»,
 * cioè un'affermazione che non possiamo fare (ADR `0016`).
 */
export const close = internalMutation({
  args: {
    deliveryId: v.id('emailDeliveries'),
    outcome: emailDeliveryOutcome,
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId)
    // L'Annullamento della Prenotazione porta via le sue Consegne: un'action
    // già in volo tornerebbe qui a chiudere una riga che non c'è più. Non è un
    // errore da sollevare — non c'è più niente da registrare.
    if (!delivery) return null

    await ctx.db.patch(args.deliveryId, {
      outcome: args.outcome,
      closedAt: new Date().toISOString(),
      ...(args.reason ? { reason: args.reason } : {}),
    })
    return null
  },
})

/**
 * Esito dell'ultima Consegna di una Prenotazione, per la schermata di Esito
 * della Prenotazione. Convex è reattivo: il browser non riceve più alcun valore
 * di ritorno dall'invio, ma resta iscritto a questa query e vede l'esito dal
 * vivo (ADR `0016`).
 *
 * È pubblica e senza autenticazione — chi ha appena prenotato non è un Membro —
 * quindi ritorna **solo l'enum**: nessun indirizzo, nessun nome. L'indirizzo da
 * confermare a schermo il browser ce l'ha già, è quello che l'Utente ha appena
 * digitato.
 */
export const outcomeForRegistration = query({
  args: { registrationId: v.id('registrations') },
  returns: v.union(emailDeliveryOutcome, v.null()),
  handler: async (ctx, args) => {
    const delivery = await latestDelivery(ctx, args.registrationId)
    return delivery?.outcome ?? null
  },
})
