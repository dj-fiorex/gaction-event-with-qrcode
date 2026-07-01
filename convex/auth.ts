import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import type { DataModel } from './_generated/dataModel'

/**
 * Provider Password.
 * La registrazione pubblica è disabilitata: gli account (admin/Assistenti)
 * vengono creati solo da un admin tramite `createAccount` (che non passa da
 * questo `profile`). Qui blocchiamo esplicitamente il flow "signUp" e ci
 * limitiamo a normalizzare l'email in fase di "signIn".
 */
const ApplicationPassword = Password<DataModel>({
  profile(params) {
    if (params.flow === 'signUp') {
      throw new Error('La registrazione pubblica è disabilitata')
    }
    const email = String(params.email ?? '').trim().toLowerCase()
    return { email }
  },
})

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ApplicationPassword],
})
