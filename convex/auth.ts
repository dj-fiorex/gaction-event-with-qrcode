import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import type { DataModel } from './_generated/dataModel'
import { MemberVerificationProvider } from './memberEmailVerification'

/**
 * Provider Password.
 * Il flow "signUp" è abilitato per la registrazione pubblica dei Membri.
 * Il ruolo viene forzato a 'member' indipendentemente da qualsiasi input
 * del client: nessun client può ottenere 'admin' o 'staff' tramite questo
 * path. Admin/Assistenti vengono creati solo tramite `createStaffAccount`.
 */
const ApplicationPassword = Password<DataModel>({
  profile(params) {
    const email = String(params.email ?? '').trim().toLowerCase()
    if (params.flow === 'signUp') {
      const name = String(params.name ?? '').trim() || undefined
      // Role is ALWAYS 'member' for public sign-up — never from client input.
      return { email, name, role: 'member' as const }
    }
    return { email }
  },
})

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ApplicationPassword, MemberVerificationProvider],
})
