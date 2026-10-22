import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { env } from './env'

let client: SupabaseClient<Database> | undefined

/**
 * Full supabase-js client (Auth + REST + Realtime) for the staff screens. Lazy-loaded with them: it is heavy, and customers never need it. Customers never sign in (ADR-0003): they only read the public
 * menu and call Edge Functions. Staff sessions live in this same client (persisted by supabase-js).
 */
export function staffClient(): SupabaseClient<Database> {
  client ??= createClient<Database>(env().VITE_SUPABASE_URL, env().VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } },
  })
  return client
}
