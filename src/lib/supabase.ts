import { PostgrestClient } from '@supabase/postgrest-js'
import { RealtimeClient } from '@supabase/realtime-js'
import type { Database } from '@/types/database'
import { env } from './env'

/*
 * What a customer needs from Supabase is small: read the public menu (REST), and listen to a couple of Realtime
 * channels. They never sign in (ADR-0003) and orders go through Edge Functions (`lib/client.ts`). So the customer
 * bundle talks to PostgREST and Realtime directly, without Auth, Storage or Functions (~60 % of supabase-js).
 * Staff screens use the full client in `supabaseStaff.ts`.
 *
 * The publishable key goes in `apikey` only: it is not a JWT, so it must not be sent as a bearer token.
 */

let rest: PostgrestClient<Database> | undefined
let realtimeClient: RealtimeClient | undefined

/** Public REST reads (anon role). */
export function db(): PostgrestClient<Database> {
  rest ??= new PostgrestClient<Database>(`${env().VITE_SUPABASE_URL}/rest/v1`, {
    headers: { apikey: env().VITE_SUPABASE_PUBLISHABLE_KEY },
  })
  return rest
}

/** Public Realtime: Postgres Changes on the menu and Broadcast on `order:<token>`. */
export function realtime(): RealtimeClient {
  realtimeClient ??= new RealtimeClient(`${env().VITE_SUPABASE_URL}/realtime/v1`.replace(/^http/, 'ws'), {
    params: { apikey: env().VITE_SUPABASE_PUBLISHABLE_KEY, eventsPerSecond: 10 },
  })
  return realtimeClient
}
