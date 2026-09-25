import { expect, test } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'
import type { ParticipantGroup } from '../../convex/checkins'
import { filterParticipants } from '../../lib/participants-filter'
import { NEVER } from '../../lib/person-status'

const status = { entry: NEVER, activity: NEVER, exit: NEVER }

function group(
  id: string,
  contactEmail: string,
  persons: Array<{
    firstName: string
    lastName?: string
    category: 'user' | 'child' | 'companion'
    nameProvided?: boolean
  }>,
): ParticipantGroup {
  return {
    registrationId: id as Id<'registrations'>,
    contactEmail,
    persons: persons.map((p, i) => ({
      personId: `${id}-${i}` as Id<'persons'>,
      firstName: p.firstName,
      lastName: p.lastName ?? null,
      category: p.category,
      age: null,
      nameProvided: p.nameProvided ?? true,
      status,
    })),
  }
}

const rossi = group('r1', 'mario@example.com', [
  { firstName: 'Mario', lastName: 'Rossi', category: 'user' },
  { firstName: 'Figlio 1', category: 'child', nameProvided: false },
])
const bianchi = group('r2', 'anna@example.com', [
  { firstName: 'Anna', lastName: 'Bianchi', category: 'user' },
  { firstName: 'Niccolò', category: 'companion' },
])
const groups = [rossi, bianchi]

test('empty search returns every group', () => {
  expect(filterParticipants(groups, '   ')).toEqual(groups)
})

test('matches the Utente by cognome, nome and email', () => {
  expect(filterParticipants(groups, 'rossi')).toEqual([rossi])
  expect(filterParticipants(groups, 'Anna')).toEqual([bianchi])
  expect(filterParticipants(groups, 'mario@')).toEqual([rossi])
})

test('a named Ospite brings the whole group, accents ignored', () => {
  expect(filterParticipants(groups, 'niccolo')).toEqual([bianchi])
})

test('positional labels are not searchable', () => {
  expect(filterParticipants(groups, 'figlio')).toEqual([])
})

test('every word must match somewhere in the group', () => {
  expect(filterParticipants(groups, 'mario rossi')).toEqual([rossi])
  expect(filterParticipants(groups, 'mario bianchi')).toEqual([])
})
