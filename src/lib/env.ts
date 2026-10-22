// Hand-rolled on purpose: this module is in the entry bundle and a schema library would triple its size.

export interface Env {
  VITE_SUPABASE_URL: string
  VITE_SUPABASE_PUBLISHABLE_KEY: string
  VITE_CLOUDINARY_CLOUD_NAME: string
  VITE_SITE_URL?: string
  VITE_TURNSTILE_SITE_KEY?: string
}

const isUrl = (v: unknown): v is string => {
  if (typeof v !== 'string') return false
  try {
    new URL(v)
    return true
  } catch {
    return false
  }
}
const isText = (v: unknown, min: number): v is string => typeof v === 'string' && v.length >= min

/** Parses the public build-time variables; throws a readable error instead of failing deep inside the app. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const invalid: string[] = []
  if (!isUrl(raw.VITE_SUPABASE_URL)) invalid.push('VITE_SUPABASE_URL')
  if (!isText(raw.VITE_SUPABASE_PUBLISHABLE_KEY, 20)) invalid.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!isText(raw.VITE_CLOUDINARY_CLOUD_NAME, 2)) invalid.push('VITE_CLOUDINARY_CLOUD_NAME')
  if (raw.VITE_SITE_URL !== undefined && !isUrl(raw.VITE_SITE_URL)) invalid.push('VITE_SITE_URL')
  if (invalid.length > 0) {
    throw new Error(
      `Faltan o son inválidas estas variables de entorno: ${invalid.join(', ')}. Revisá .env (ver .env.example).`,
    )
  }
  return {
    VITE_SUPABASE_URL: raw.VITE_SUPABASE_URL as string,
    VITE_SUPABASE_PUBLISHABLE_KEY: raw.VITE_SUPABASE_PUBLISHABLE_KEY as string,
    VITE_CLOUDINARY_CLOUD_NAME: raw.VITE_CLOUDINARY_CLOUD_NAME as string,
    ...(typeof raw.VITE_SITE_URL === 'string' ? { VITE_SITE_URL: raw.VITE_SITE_URL } : {}),
    ...(typeof raw.VITE_TURNSTILE_SITE_KEY === 'string' && raw.VITE_TURNSTILE_SITE_KEY !== ''
      ? { VITE_TURNSTILE_SITE_KEY: raw.VITE_TURNSTILE_SITE_KEY }
      : {}),
  }
}

let cached: Env | undefined
export function env(): Env {
  cached ??= parseEnv(import.meta.env)
  return cached
}
