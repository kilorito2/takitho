import { z } from 'zod'
import { HttpError } from '../errors.ts'
import { clientIp, json, readJson } from '../http.ts'
import { createPreference, getPayment, verifyWebhookSignature } from '../mp.ts'
import { enforceRateLimit, ipKey } from '../order-pipeline.ts'
import type { Deps } from '../ports.ts'
import { MpPreferenceSchema, parseBody } from '../schemas.ts'

const PREFERENCE_IP_LIMIT = 20

/** POST create-mp-preference — (re)creates the checkout for an unpaid MP order (docs/API.md §3.3). */
export async function handleCreateMpPreference(req: Request, deps: Deps): Promise<Response> {
  const { order_code, public_token } = parseBody(MpPreferenceSchema, await readJson(req))
  await enforceRateLimit(deps, await ipKey(deps, 'mp-pref', clientIp(req)), PREFERENCE_IP_LIMIT)
  const order = await deps.repo.getOrderByToken(public_token)
  if (!order || order.code.toLowerCase() !== order_code.toLowerCase()) throw new HttpError('NOT_FOUND', 'No encontramos ese pedido.')
  if (order.paymentMethod !== 'mercado_pago' || order.status !== 'pending_payment' || order.paymentStatus === 'paid') {
    throw new HttpError('ORDER_NOT_PAYABLE', 'Este pedido no tiene un pago pendiente.')
  }
  const settings = await deps.repo.loadSettings()
  const preference = await createPreference(deps, order, public_token, settings.name, settings.pendingPaymentTtlMin)
  await deps.repo.setPreferenceId(order.id, preference.id)
  return json(200, { init_point: preference.checkoutUrl, preference_id: preference.id })
}

const WebhookBody = z.object({ type: z.string().optional(), data: z.object({ id: z.union([z.string(), z.number()]).optional() }).optional() })

/**
 * POST mp-webhook. The body is NOT trusted: after the signature check we ask Mercado Pago for the payment
 * and only then call apply_payment_result (idempotent). The back_url never marks anything as paid.
 */
export async function handleMpWebhook(req: Request, deps: Deps): Promise<Response> {
  const mp = deps.config.mp
  if (!mp) throw new HttpError('MP_UNAVAILABLE', 'Mercado Pago no está configurado todavía.')
  const url = new URL(req.url)
  const queryId = url.searchParams.get('data.id')

  const verdict = await verifyWebhookSignature({
    xSignature: req.headers.get('x-signature'),
    xRequestId: req.headers.get('x-request-id'),
    dataId: queryId,
    secret: mp.webhookSecret,
    nowMs: deps.now().getTime(),
  })
  if (verdict !== 'ok') {
    deps.log('mp webhook rejected', { verdict, requestId: req.headers.get('x-request-id') })
    throw new HttpError('INVALID_SIGNATURE', 'Firma inválida.')
  }

  const body = WebhookBody.safeParse(await readJson(req).catch(() => ({})))
  const type = url.searchParams.get('type') ?? (body.success ? body.data.type : undefined)
  if (type !== 'payment') return json(200, { ignored: true })

  const rawId = queryId ?? (body.success && body.data.data?.id !== undefined ? String(body.data.data.id) : null)
  if (!rawId || !/^\d{1,20}$/.test(rawId)) return json(200, { ignored: true })

  const payment = await getPayment(deps, rawId)
  const orderId = payment.external_reference
  if (!orderId || !z.uuid().safeParse(orderId).success) {
    deps.log('mp payment without a valid external_reference', { paymentId: rawId })
    return json(200, { ignored: true })
  }

  const outcome = await deps.repo.applyPaymentResult({
    orderId,
    mpPaymentId: String(payment.id),
    mpStatus: payment.status,
    amount: payment.transaction_amount,
    currency: payment.currency_id,
    raw: { id: payment.id, status: payment.status, amount: payment.transaction_amount, currency: payment.currency_id },
  })
  return json(200, outcome)
}
