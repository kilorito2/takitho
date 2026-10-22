export type StaffRole = 'admin' | 'kitchen'

export const canAccess = (role: StaffRole, allowed: readonly StaffRole[]): boolean => allowed.includes(role)

/** Where each role lands after signing in. */
export const homeFor = (role: StaffRole): string => (role === 'admin' ? '/admin' : '/cocina')

const STAFF_AREAS = ['/cocina', '/admin']

/**
 * The `?next=` of the login page, only if it points inside the staff areas: anything else
 * (other origins, protocol-relative URLs, customer pages) is ignored so the login cannot be used as an open redirect.
 */
export function safeNext(next: string | null): string | null {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null
  const path = next.split(/[?#]/)[0] ?? ''
  return STAFF_AREAS.some((area) => path === area || path.startsWith(`${area}/`)) ? next : null
}

/** Supabase Auth messages are English and technical; staff get a short Spanish sentence. */
export function loginErrorMessage(error: { message: string; status?: number | undefined }): string {
  const text = error.message.toLowerCase()
  if (error.status === 429 || text.includes('rate limit'))
    return 'Demasiados intentos. Esperá un minuto y volvé a probar.'
  if (text.includes('invalid login') || text.includes('invalid credentials'))
    return 'Email o contraseña incorrectos.'
  if (text.includes('fetch') || text.includes('network'))
    return 'No hay conexión. Revisá el WiFi y probá de nuevo.'
  return 'No pudimos iniciar sesión. Probá de nuevo.'
}
