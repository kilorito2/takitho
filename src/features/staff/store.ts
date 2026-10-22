import { useEffect } from 'react'
import { create } from 'zustand'
import { staffClient } from '@/lib/supabaseStaff'
import { loginErrorMessage, type StaffRole } from './roles'

export interface Staff {
  id: string
  email: string
  name: string
  role: StaffRole
}

/** loading: checking the saved session · signed_out · signed_in · no_access: a valid login without an active staff profile. */
export type StaffStatus = 'loading' | 'signed_out' | 'signed_in' | 'no_access'

interface StaffState {
  status: StaffStatus
  staff: Staff | null
  init: () => void
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

let started = false

async function loadStaff(userId: string, email: string): Promise<Staff | null> {
  const { data, error } = await staffClient()
    .from('profiles')
    .select('role, full_name, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data?.is_active) return null
  return { id: userId, email, name: data.full_name, role: data.role }
}

/**
 * Staff session (ADR-0003). supabase-js persists the session; this store mirrors it and adds the role from `profiles`.
 * The role shown here only drives the UI: every action is checked again in Postgres (RLS and `auth_role()`).
 */
export const useStaffStore = create<StaffState>()((set) => {
  const apply = async (session: { user: { id: string; email?: string | undefined } } | null) => {
    if (!session) {
      set({ status: 'signed_out', staff: null })
      return
    }
    try {
      const staff = await loadStaff(session.user.id, session.user.email ?? '')
      set(staff ? { status: 'signed_in', staff } : { status: 'no_access', staff: null })
    } catch {
      // Profile unreadable (offline, expired token): do not lock a working kitchen out; keep the last known state.
      set((s) => (s.status === 'loading' ? { status: 'signed_out', staff: null } : s))
    }
  }

  return {
    status: 'loading',
    staff: null,
    init: () => {
      if (started) return
      started = true
      void staffClient()
        .auth.getSession()
        .then(({ data }) => apply(data.session))
      staffClient().auth.onAuthStateChange((event, session) => {
        // Defer: supabase-js forbids awaiting other client calls inside this callback.
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
        setTimeout(() => void apply(session), 0)
      })
    },
    signIn: async (email, password) => {
      const { error } = await staffClient().auth.signInWithPassword({ email: email.trim(), password })
      return error ? loginErrorMessage(error) : null
    },
    signOut: async () => {
      await staffClient().auth.signOut()
      set({ status: 'signed_out', staff: null })
    },
  }
})

export function useStaff() {
  const state = useStaffStore()
  const { init } = state
  useEffect(() => {
    init()
  }, [init])
  return state
}
