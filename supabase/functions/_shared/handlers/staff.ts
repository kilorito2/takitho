import { HttpError } from '../errors.ts'
import { bearerToken, json, readJson } from '../http.ts'
import type { Deps } from '../ports.ts'
import { CloudinarySignSchema, InviteStaffSchema, parseBody } from '../schemas.ts'

async function requireAdmin(req: Request, deps: Deps): Promise<{ userId: string }> {
  const jwt = bearerToken(req)
  if (!jwt) throw new HttpError('UNAUTHENTICATED', 'Iniciá sesión para continuar.')
  const staff = await deps.repo.authenticateStaff(jwt)
  if (!staff) throw new HttpError('UNAUTHENTICATED', 'Tu sesión venció. Volvé a iniciar sesión.')
  if (staff.role !== 'admin') throw new HttpError('FORBIDDEN', 'Esto es solo para administradores.')
  return { userId: staff.userId }
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * POST cloudinary-sign (admin) — signed direct upload so the API secret never reaches the browser (ADR-0009).
 * The browser must send exactly the returned `params` plus api_key, timestamp and signature.
 */
export async function handleCloudinarySign(req: Request, deps: Deps): Promise<Response> {
  await requireAdmin(req, deps)
  const cloudinary = deps.config.cloudinary
  if (!cloudinary) throw new HttpError('INTERNAL', 'Cloudinary no está configurado.')
  const { kind, slug } = parseBody(CloudinarySignSchema, await readJson(req))
  const folder = kind === 'menu' ? 'takitho/menu' : 'takitho/brand'
  const name = slug ?? `p-${crypto.randomUUID().slice(0, 8)}`
  const timestamp = Math.floor(deps.now().getTime() / 1000)
  const params = { asset_folder: folder, invalidate: 'true', overwrite: 'true', public_id: `${folder}/${name}` }
  // Cloudinary signs the alphabetically sorted "k=v&k=v" string with the API secret appended (SHA-1).
  const toSign = Object.entries({ ...params, timestamp })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const signature = await sha1Hex(toSign + cloudinary.apiSecret)
  return json(200, {
    cloud_name: cloudinary.cloudName,
    api_key: cloudinary.apiKey,
    timestamp,
    signature,
    public_id: params.public_id,
    params,
    upload_url: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,
  })
}

/** POST invite-staff (admin) — email invitation + profile with the chosen role. */
export async function handleInviteStaff(req: Request, deps: Deps): Promise<Response> {
  await requireAdmin(req, deps)
  const { email, role, full_name } = parseBody(InviteStaffSchema, await readJson(req))
  const invited = await deps.repo.inviteStaff({
    email: email.toLowerCase(),
    role,
    fullName: full_name ?? null,
    redirectTo: `${deps.config.siteUrl}/staff/login`,
  })
  return json(200, { user_id: invited.userId, email: email.toLowerCase(), role })
}
