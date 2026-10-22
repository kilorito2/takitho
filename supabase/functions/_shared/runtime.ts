// Deno wiring: reads secrets, builds the service-role client and the production Deps.
// Only the function entrypoints import this file (everything else is runtime-agnostic and unit-tested).
import { createClient } from '@supabase/supabase-js'
import { loadConfig } from './config.ts'
import type { Deps } from './ports.ts'
import { createSupabaseRepo } from './supabase-repo.ts'

export function buildDeps(): Deps {
  const env = (name: string) => Deno.env.get(name)
  const url = env('SUPABASE_URL')
  // New projects expose secret keys as a JSON dictionary; legacy projects still inject the service-role JWT.
  let secret: string | undefined
  try {
    secret = (JSON.parse(env('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>).default
  } catch {
    secret = undefined
  }
  secret ??= env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !secret) throw new Error('Missing SUPABASE_URL or a service key')

  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
  return {
    repo: createSupabaseRepo(db),
    config: loadConfig(env),
    now: () => new Date(),
    fetch: (input, init) => fetch(input, init),
    log: (message, detail) => {
      console.error(message, detail ?? '')
    },
  }
}
