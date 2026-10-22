import { createApiClient } from './api'
import { env } from './env'

let client: ReturnType<typeof createApiClient> | undefined

/** Singleton Edge Functions client (public key; staff calls pass their access token explicitly). */
export function api() {
  client ??= createApiClient({
    functionsUrl: `${env().VITE_SUPABASE_URL}/functions/v1`,
    publishableKey: env().VITE_SUPABASE_PUBLISHABLE_KEY,
  })
  return client
}
