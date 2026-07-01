import { seed, type SeedStore } from './seed'

/**
 * Database mock in memoria.
 *
 * I dati vivono nella memoria del processo del server e vengono resettati a
 * ogni riavvio / ridistribuzione. Sostituibile con un database reale
 * mantenendo la stessa interfaccia esposta dalle funzioni sottostanti.
 *
 * Il seed dei dati mock vive in ./seed. Usiamo globalThis per preservare lo
 * stato attraverso gli hot-reload di Next.
 */

const globalForDb = globalThis as unknown as {
  __eventStoreV3?: SeedStore
}

function getStore(): SeedStore {
  if (!globalForDb.__eventStoreV3) {
    globalForDb.__eventStoreV3 = seed()
  }
  return globalForDb.__eventStoreV3
}

export const db = {
  get events() {
    return getStore().events
  },
  get registrations() {
    return getStore().registrations
  },
}
