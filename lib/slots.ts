import type { Slot } from './types'

/**
 * Genera gli Slot consecutivi di un'Attività a partire dalla finestra
 * inizio-fine e dalla Durata. Vengono creati solo Slot interi: un eventuale
 * residuo finale inferiore alla Durata viene ignorato.
 */
export function generateSlots(
  activityId: string,
  startIso: string,
  endIso: string,
  durationMinutes: number,
  capacityPerSlot: number,
): Slot[] {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const stepMs = durationMinutes * 60_000

  if (!Number.isFinite(start) || !Number.isFinite(end) || stepMs <= 0 || end <= start) {
    return []
  }

  const slots: Slot[] = []
  let index = 0
  for (let cursor = start; cursor + stepMs <= end; cursor += stepMs) {
    slots.push({
      id: `${activityId}-s${index}`,
      activityId,
      start: new Date(cursor).toISOString(),
      end: new Date(cursor + stepMs).toISOString(),
      capacity: capacityPerSlot,
    })
    index++
  }
  return slots
}

/** True se due intervalli temporali [start,end) si sovrappongono. */
export function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const aS = new Date(aStart).getTime()
  const aE = new Date(aEnd).getTime()
  const bS = new Date(bStart).getTime()
  const bE = new Date(bEnd).getTime()
  return aS < bE && bS < aE
}
