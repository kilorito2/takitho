import type { FunctionConfig } from './ports.ts'

const int = (value: string | undefined, fallback: number): number => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '')

/**
 * Builds the runtime configuration from environment variables (Supabase Functions secrets).
 * Pure so it can be tested; the Deno wiring lives in runtime.ts.
 */
export function loadConfig(env: (name: string) => string | undefined): FunctionConfig {
  const supabaseUrl = trimSlash(env('SUPABASE_URL') ?? '')
  const mpToken = env('MP_ACCESS_TOKEN')
  const mpSecret = env('MP_WEBHOOK_SECRET')
  const mpEnv = env('MP_ENV') === 'production' ? 'production' : 'sandbox'
  // A custom MP base URL exists only so tests/QA can stub the API; it is ignored in production (ADR-0014).
  const customBase = env('MP_API_BASE')
  const apiBase = mpEnv === 'sandbox' && customBase ? trimSlash(customBase) : 'https://api.mercadopago.com'

  const cloudName = env('CLOUDINARY_CLOUD_NAME')
  const apiKey = env('CLOUDINARY_API_KEY')
  const apiSecret = env('CLOUDINARY_API_SECRET')

  return {
    allowedOrigins: (env('ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    siteUrl: trimSlash(env('SITE_URL') ?? ''),
    functionsUrl: trimSlash(env('FUNCTIONS_URL') ?? `${supabaseUrl}/functions/v1`),
    ipHashSalt: env('IP_HASH_SALT') ?? 'takitho-dev-salt',
    turnstileSecret: env('TURNSTILE_SECRET') || null,
    mp: mpToken && mpSecret ? { accessToken: mpToken, webhookSecret: mpSecret, env: mpEnv, apiBase } : null,
    cloudinary: cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null,
    limits: {
      createIp: int(env('RATE_CREATE_IP'), 5),
      createPhone: int(env('RATE_CREATE_PHONE'), 3),
      quoteIp: int(env('RATE_QUOTE_IP'), 60),
      getOrderIp: int(env('RATE_GET_ORDER_IP'), 120),
      windowSeconds: int(env('RATE_WINDOW_SECONDS'), 600),
    },
  }
}
