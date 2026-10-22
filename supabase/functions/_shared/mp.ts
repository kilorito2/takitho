// Mercado Pago (Checkout Pro) — webhook signature, preference and payment lookups (ADR-0007).
// Verified against the official SDK source (mercadopago@3.6.1, utils/webhook) and the docs on 2026-10-21.
import { z } from 'zod'
import { hmacSha256Hex, timingSafeEqual } from './crypto.ts'
import { HttpError } from './errors.ts'
import type { Deps, StoredOrder } from './ports.ts'

export type SignatureVerdict = 'ok' | 'missing' | 'malformed' | 'mismatch' | 'stale'

/**
 * x-signature = "ts=<unix seconds>,v1=<hex hmac-sha256>".
 * Manifest (pairs whose value is missing are omitted): `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
export async function verifyWebhookSignature(args: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  secret: string
  nowMs: number
  toleranceSeconds?: number
}): Promise<SignatureVerdict> {
  const header = args.xSignature?.trim()
  if (!header) return 'missing'
  let ts: string | undefined
  let v1: string | undefined
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    if (key === 'ts') ts = value
    else if (key === 'v1') v1 = value
  }
  if (!ts || !/^\d+$/.test(ts) || !v1) return 'malformed'

  const manifest = [
    args.dataId ? `id:${args.dataId}` : null,
    args.xRequestId ? `request-id:${args.xRequestId}` : null,
    `ts:${ts}`,
  ]
    .filter((p): p is string => p !== null)
    .join(';')
  const expected = await hmacSha256Hex(args.secret, `${manifest};`)
  if (!timingSafeEqual(expected, v1)) return 'mismatch'

  const drift = Math.abs(args.nowMs - Number(ts) * 1000) / 1000
  if (drift > (args.toleranceSeconds ?? 300)) return 'stale'
  return 'ok'
}

const PreferenceResponse = z.object({
  id: z.string(),
  init_point: z.string().url(),
  sandbox_init_point: z.string().url().optional(),
})

export interface Preference {
  id: string
  checkoutUrl: string
}

/** One line "Pedido TK-0427" for the whole total: no rounding drift between items and the order total. */
export async function createPreference(
  deps: Deps,
  order: Pick<StoredOrder, 'id' | 'code' | 'total'>,
  publicToken: string,
  storeName: string,
  ttlMinutes: number,
): Promise<Preference> {
  const mp = deps.config.mp
  if (!mp) throw new HttpError('MP_UNAVAILABLE', 'Mercado Pago no está configurado todavía.')
  const back = `${deps.config.siteUrl}/pedido/${encodeURIComponent(order.code)}?t=${encodeURIComponent(publicToken)}`
  const now = deps.now()
  const body = {
    items: [{ id: order.code, title: `Pedido ${order.code} · ${storeName}`, quantity: 1, unit_price: order.total, currency_id: 'ARS' }],
    external_reference: order.id,
    notification_url: `${deps.config.functionsUrl}/mp-webhook`,
    back_urls: { success: back, failure: back, pending: back },
    auto_return: 'approved',
    binary_mode: true,
    // Cash-in-a-branch methods settle days later; the kitchen needs the money now.
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
    expires: true,
    expiration_date_from: now.toISOString(),
    expiration_date_to: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
    statement_descriptor: storeName.slice(0, 22).toUpperCase(),
    metadata: { order_code: order.code },
  }
  let res: Response
  try {
    res = await deps.fetch(`${mp.apiBase}/checkout/preferences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mp.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    deps.log('mp preference network error', error instanceof Error ? error.message : error)
    throw new HttpError('MP_UNAVAILABLE', 'No pudimos conectar con Mercado Pago. Probá de nuevo en un momento.')
  }
  if (!res.ok) {
    deps.log('mp preference rejected', { status: res.status })
    throw new HttpError('MP_UNAVAILABLE', 'Mercado Pago no pudo crear el pago. Probá de nuevo en un momento.')
  }
  const parsed = PreferenceResponse.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new HttpError('MP_UNAVAILABLE', 'Mercado Pago respondió algo inesperado.')
  const { id, init_point, sandbox_init_point } = parsed.data
  return { id, checkoutUrl: mp.env === 'sandbox' && sandbox_init_point ? sandbox_init_point : init_point }
}

const PaymentResponse = z.object({
  id: z.union([z.number(), z.string()]),
  status: z.string(),
  external_reference: z.string().nullable().optional(),
  transaction_amount: z.number(),
  currency_id: z.string(),
})
export type MpPayment = z.infer<typeof PaymentResponse>

/** Third-party data is untrusted: only the fields we use are kept, after validation. */
export async function getPayment(deps: Deps, paymentId: string): Promise<MpPayment> {
  const mp = deps.config.mp
  if (!mp) throw new HttpError('MP_UNAVAILABLE', 'Mercado Pago no está configurado todavía.')
  const res = await deps.fetch(`${mp.apiBase}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${mp.accessToken}` },
  })
  if (res.status === 404) throw new HttpError('NOT_FOUND', 'Pago inexistente.')
  if (!res.ok) throw new HttpError('MP_UNAVAILABLE', 'No pudimos consultar el pago a Mercado Pago.')
  const parsed = PaymentResponse.safeParse(await res.json().catch(() => null))
  if (!parsed.success) throw new HttpError('MP_UNAVAILABLE', 'Mercado Pago respondió algo inesperado.')
  return parsed.data
}
