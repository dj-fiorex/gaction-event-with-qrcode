'use client'

import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export type Role = 'admin' | 'staff' | 'member'

export interface CurrentUser {
  id: string
  name: string | null
  email: string | null
  role: Role
}

interface CurrentUserState {
  user: CurrentUser | null
  role: Role | null
  isLoading: boolean
  isAuthenticated: boolean
}

/**
 * Stato di autenticazione derivato da Convex Auth + record applicativo `users`.
 * `isLoading` è true finché sia lo stato auth sia la query profilo non sono pronti.
 */
export function useCurrentUser(): CurrentUserState {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth()
  const user = useQuery(api.accounts.me, isAuthenticated ? {} : 'skip')

  const isLoading = authLoading || (isAuthenticated && user === undefined)

  return {
    user: user ?? null,
    role: user?.role ?? null,
    isLoading,
    isAuthenticated,
  }
}
