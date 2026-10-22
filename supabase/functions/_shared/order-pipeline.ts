// The server-side pipeline behind quote-order and create-order (docs/API.md §3.1–3.2).
// Everything a customer sends is treated as a *request*; prices, hours, stock and coupons come from the database.
import { HttpError, type ApiErrorCode } from './errors.ts'
import { sha256Hex, stableStringify } from './crypto.ts'
import { businessDate, localParts, storeStatus, validateScheduledAt, type StoreStatus } from './hours.ts'
import { cashChange } from './money.ts'
import { normalizeArPhone } from './phone.ts'
import {
  computeQuote,
  evaluateCoupon,
  type CartLine,
  type PricingError,
  type PricingErrorCode,
  type Quote,
} from './pricing.ts'
import { RepoError, type CouponRecord, type CreatedOrder, type Deps, type OrderTxPayload, type StoreSettings } from './ports.ts'
import { sanitizeText } from './sanitize.ts'
import type { CreateOrderInput, OrderInput } from './schemas.ts'

/** Delivery adds travel time on top of the base preparation time. */
const DELIVERY_EXTRA_MINUTES = 15

const PRICING_TO_API: Record<PricingErrorCode, ApiErrorCode> = {
  EMPTY_CART: 'VALIDATION_ERROR',
  INVALID_QUANTITY: 'VALIDATION_ERROR',
  UNKNOWN_PRODUCT: 'ITEM_UNAVAILABLE',
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  INVALID_MODIFIERS: 'INVALID_MODIFIERS',
  INVALID_COUPON: 'INVALID_COUPON',
  BELOW_MIN_ORDER: 'BELOW_MIN_ORDER',
  INVALID_TIP: 'VALIDATION_ERROR',
  ZONE_REQUIRED: 'VALIDATION_ERROR',
}

export function pricingToHttp(error: PricingError): HttpError {
  return new HttpError(PRICING_TO_API[error.code], error.message, error.details)
}

/** "19 h" / "19:30 h" — how the shop talks about opening time. */
export function formatClock(date: Date, tz: string): string {
  const p = localParts(date, tz)
  return p.minute === 0 ? `${p.hour} h` : `${p.hour}:${String(p.minute).padStart(2, '0')} h`
}

export function toCartLines(input: OrderInput): CartLine[] {
  return input.items.map((item) => {
    const note = item.note === undefined ? '' : sanitizeText(item.note)
    return { productId: item.product_id, quantity: item.quantity, modifierIds: item.modifier_ids, ...(note ? { note } : {}) }
  })
}

export interface Prepared {
  settings: StoreSettings
  status: StoreStatus
  quote: Quote
  coupon: CouponRecord | null
  zoneId: string | null
  tableId: string | null
  scheduledFor: Date | null
  estimatedMinutes: number | null
}

interface PrepareOptions {
  /** create-order enforces open/paused/slots; quote-order only reports them. */
  enforceStore: boolean
  phone: string
}

export async function prepareOrder(deps: Deps, input: OrderInput, { enforceStore, phone }: PrepareOptions): Promise<Prepared> {
  const { repo } = deps
  const now = deps.now()
  const [settings, shifts] = await Promise.all([repo.loadSettings(), repo.loadHours()])
  const tz = settings.timezone
  const status = storeStatus({
    now,
    shifts,
    tz,
    isPaused: settings.isPaused,
    isClosedManually: settings.isClosedManually,
    acceptsScheduledWhenClosed: settings.acceptsScheduledWhenClosed,
  })

  let scheduledFor: Date | null = null
  if (input.schedule.mode === 'scheduled') scheduledFor = new Date(input.schedule.at)
  if (enforceStore) {
    if (input.schedule.mode === 'asap') {
      if (!status.canOrderNow) {
        if (status.reason === 'paused') {
          throw new HttpError('STORE_PAUSED', 'Estamos con mucho trabajo y pausamos los pedidos un rato. Podés programar uno para más tarde.', {
            can_schedule: status.canSchedule,
          })
        }
        const reopen = status.nextOpenAt
        throw new HttpError(
          'STORE_CLOSED',
          status.reason === 'manual' || !reopen ? 'Hoy no estamos tomando pedidos.' : `Estamos cerrados, prendemos el comal a las ${formatClock(reopen, tz)}.`,
          { next_open_at: reopen?.toISOString() ?? null, can_schedule: status.canSchedule },
        )
      }
    } else {
      if (!status.canSchedule) throw new HttpError('STORE_CLOSED', 'Hoy no estamos tomando pedidos, ni programados.')
      const slotOk =
        scheduledFor !== null &&
        validateScheduledAt(scheduledFor, now, shifts, tz, { prepMinutes: settings.prepMinutes, stepMinutes: 15, maxDays: settings.maxScheduleDays })
      if (!slotOk) throw new HttpError('INVALID_SLOT', 'Ese horario ya no está disponible. Elegí otro.')
    }
  }

  const lines = toCartLines(input)
  const [products, zone, table] = await Promise.all([
    repo.loadProducts([...new Set(lines.map((l) => l.productId))]),
    input.delivery ? repo.loadZone(input.delivery.zone_id) : Promise.resolve(null),
    input.type === 'dine_in' && input.table_number !== undefined ? repo.loadTableByNumber(input.table_number) : Promise.resolve(null),
  ])
  if (input.type === 'delivery' && !zone) throw new HttpError('VALIDATION_ERROR', 'Esa zona de entrega ya no existe. Elegí otra.')
  if (input.type === 'dine_in' && !table) throw new HttpError('INVALID_TABLE', 'No encontramos esa mesa. Pedile ayuda a alguien del local.')

  const base = {
    products,
    lines,
    orderType: input.type,
    zone: input.type === 'delivery' ? zone : null,
    tip: input.tip ?? 0,
    now,
    tz,
  }

  let coupon: CouponRecord | null = null
  if (input.coupon_code) {
    coupon = await repo.findCouponByCode(input.coupon_code, phone)
    if (!coupon) throw new HttpError('INVALID_COUPON', 'Ese cupón no existe.', { reason: 'unknown' })
  } else {
    // Automatic promos ("Martes de tacos 2x1"): apply the one that saves the most, never stack.
    const autos = await repo.listAutoCoupons(phone)
    if (autos.length > 0) {
      const withoutCoupon = computeQuote({ ...base, tip: 0 })
      if (withoutCoupon.ok) {
        let best = 0
        for (const candidate of autos) {
          const r = evaluateCoupon(candidate, withoutCoupon.value.lines, { now, tz })
          if (r.ok && r.discount > best) {
            best = r.discount
            coupon = candidate
          }
        }
      }
    }
  }

  const result = computeQuote({ ...base, coupon })
  if (!result.ok) throw pricingToHttp(result.error)

  const estimatedMinutes =
    input.schedule.mode === 'asap' ? settings.prepMinutes + (input.type === 'delivery' ? DELIVERY_EXTRA_MINUTES : 0) : null

  return {
    settings,
    status,
    quote: result.value,
    coupon,
    zoneId: input.type === 'delivery' ? (zone?.id ?? null) : null,
    tableId: table?.id ?? null,
    scheduledFor,
    estimatedMinutes,
  }
}

/** snake_case DTO of docs/API.md `Quote`. */
export function toQuoteDto(prepared: Prepared) {
  const { quote, status, estimatedMinutes } = prepared
  return {
    lines: quote.lines.map((l) => ({
      product_id: l.productId,
      name: l.name,
      unit_total: l.unitTotal,
      quantity: l.quantity,
      line_total: l.lineTotal,
      modifiers: l.modifiers.map((m) => ({ modifier_id: m.modifierId, name: m.name, price_delta: m.priceDelta })),
    })),
    subtotal: quote.subtotal,
    discount: quote.discount,
    coupon: quote.coupon,
    delivery_fee: quote.deliveryFee,
    tip: quote.tip,
    total: quote.total,
    estimated_minutes: estimatedMinutes,
    store: { open: status.isOpen, paused: status.reason === 'paused', next_open_at: status.nextOpenAt?.toISOString() ?? null },
    warnings: [] as { code: string; product_id?: string; details?: unknown }[],
  }
}

/* ------------------------------ rate limiting ------------------------------ */

export async function enforceRateLimit(deps: Deps, key: string, max: number): Promise<void> {
  const r = await deps.repo.checkRateLimit(key, max, deps.config.limits.windowSeconds)
  if (!r.allowed) {
    throw new HttpError('RATE_LIMITED', 'Hiciste muchos intentos seguidos. Esperá un ratito y probá de nuevo.', { retry_after_s: r.retryAfterSeconds })
  }
}

export const ipKey = async (deps: Deps, scope: string, ip: string): Promise<string> =>
  `${scope}:ip:${(await sha256Hex(deps.config.ipHashSalt + ip)).slice(0, 32)}`

/* ------------------------------ turnstile (optional) ------------------------------ */

async function verifyTurnstile(deps: Deps, token: string | undefined, ip: string): Promise<void> {
  const secret = deps.config.turnstileSecret
  if (!secret) return
  if (!token) throw new HttpError('VALIDATION_ERROR', 'No pudimos verificar que sos una persona. Recargá la página y probá de nuevo.')
  const res = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  })
  const data = (await res.json().catch(() => ({}))) as { success?: boolean }
  if (!data.success) throw new HttpError('VALIDATION_ERROR', 'No pudimos verificar que sos una persona. Recargá la página y probá de nuevo.')
}

/* ------------------------------ create-order ------------------------------ */

export interface CreateOrderResult {
  status: 200 | 201
  body: {
    order: Pick<CreatedOrder, 'id' | 'code' | 'public_token' | 'status' | 'payment_status' | 'total' | 'estimated_minutes'>
    next: { action: 'track' } | { action: 'pay_mercado_pago' }
    replayed: boolean
  }
}

const orderDto = (o: CreatedOrder, method: string): CreateOrderResult['body'] => ({
  order: {
    id: o.id,
    code: o.code,
    public_token: o.public_token,
    status: o.status,
    payment_status: o.payment_status,
    total: o.total,
    estimated_minutes: o.estimated_minutes,
  },
  next: method === 'mercado_pago' && o.payment_status !== 'paid' ? { action: 'pay_mercado_pago' } : { action: 'track' },
  replayed: o.replayed,
})

export async function createOrder(deps: Deps, body: CreateOrderInput, ip: string): Promise<CreateOrderResult> {
  const { repo, config } = deps

  // Honeypot: pretend it worked so bots do not learn anything, and create nothing.
  if (body.website) {
    return {
      status: 201,
      body: {
        order: { id: crypto.randomUUID(), code: 'TK-0000', public_token: crypto.randomUUID().replaceAll('-', ''), status: 'received', payment_status: 'pending', total: 0, estimated_minutes: null },
        next: { action: 'track' },
        replayed: false,
      },
    }
  }

  const phone = normalizeArPhone(body.customer.phone)
  if (!phone.ok) {
    throw new HttpError('VALIDATION_ERROR', 'Revisá el WhatsApp: tiene que ser un celular argentino.', { fieldErrors: { 'customer.phone': ['Número inválido'] } })
  }

  // Canonical hash of what the customer asked for (never includes the key, honeypot or captcha token).
  const { idempotency_key: key, website: _honeypot, turnstile_token: turnstileToken, ...rest } = body
  const requestHash = await sha256Hex(stableStringify({ ...rest, customer: { ...rest.customer, phone: phone.e164 } }))

  // A retry of an already-created order must succeed without consuming rate-limit budget.
  const existing = await repo.findOrderByKey(key)
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new HttpError('IDEMPOTENCY_KEY_REUSED', 'Este pedido ya se envió con otros datos. Volvé a armarlo desde la bandeja.')
    }
    return { status: 200, body: orderDto({ ...existing, replayed: true }, rest.payment.method) }
  }

  const ipHash = (await sha256Hex(config.ipHashSalt + ip)).slice(0, 32)
  await enforceRateLimit(deps, `create:ip:${ipHash}`, config.limits.createIp)
  await enforceRateLimit(deps, `create:phone:${(await sha256Hex(config.ipHashSalt + phone.e164)).slice(0, 32)}`, config.limits.createPhone)
  await verifyTurnstile(deps, turnstileToken, ip)

  const settings0 = await repo.loadSettings()
  const enabled = { mercado_pago: settings0.payMpEnabled, cash: settings0.payCashEnabled, transfer: settings0.payTransferEnabled }
  if (!enabled[rest.payment.method]) {
    throw new HttpError('PAYMENT_METHOD_DISABLED', 'Ese medio de pago no está disponible en este momento.')
  }

  const prepared = await prepareOrder(deps, body, { enforceStore: true, phone: phone.e164 })
  const { quote } = prepared

  let cashPaidWith: number | null = null
  if (rest.payment.method === 'cash' && rest.payment.cash_paid_with !== undefined) {
    const change = cashChange(quote.total, rest.payment.cash_paid_with)
    if (!change.ok) {
      throw new HttpError('INVALID_CASH', `Con ese billete no alcanza: te faltan $ ${change.shortBy}.`, { short_by: change.shortBy })
    }
    cashPaidWith = rest.payment.cash_paid_with
  }

  const payload: OrderTxPayload = {
    idempotency_key: key,
    request_hash: requestHash,
    business_date: businessDate(deps.now(), prepared.settings.timezone),
    initial_status: rest.payment.method === 'mercado_pago' ? 'pending_payment' : 'received',
    type: body.type,
    customer: { name: sanitizeText(body.customer.name, 60), phone: phone.e164 },
    delivery:
      body.type === 'delivery' && body.delivery
        ? {
            street: sanitizeText(body.delivery.street, 80),
            number: sanitizeText(body.delivery.number, 12),
            floor_apt: body.delivery.floor_apt ? sanitizeText(body.delivery.floor_apt, 30) : null,
            references: body.delivery.references ? sanitizeText(body.delivery.references, 140) : null,
          }
        : {},
    zone_id: prepared.zoneId,
    table_id: prepared.tableId,
    scheduled_for: prepared.scheduledFor?.toISOString() ?? null,
    totals: { subtotal: quote.subtotal, delivery_fee: quote.deliveryFee, discount: quote.discount, tip: quote.tip, total: quote.total },
    coupon_id: prepared.coupon?.id ?? null,
    payment: { method: rest.payment.method, cash_paid_with: cashPaidWith },
    estimated_minutes: prepared.estimatedMinutes,
    client_ip_hash: ipHash,
    items: quote.lines.map((l) => ({
      product_id: l.productId,
      name: l.name,
      unit_price: l.unitTotal,
      quantity: l.quantity,
      line_total: l.lineTotal,
      note: l.note ?? null,
      modifiers: l.modifiers.map((m) => ({ modifier_id: m.modifierId, name: m.name, price_delta: m.priceDelta })),
    })),
  }

  try {
    const created = await repo.createOrderTx(payload)
    return { status: created.replayed ? 200 : 201, body: orderDto(created, rest.payment.method) }
  } catch (error) {
    if (error instanceof RepoError) {
      if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
        throw new HttpError('IDEMPOTENCY_KEY_REUSED', 'Este pedido ya se envió con otros datos. Volvé a armarlo desde la bandeja.')
      }
      if (error.code === 'COUPON_EXHAUSTED' || error.code === 'COUPON_PHONE_EXHAUSTED') {
        throw new HttpError('INVALID_COUPON', error.code === 'COUPON_PHONE_EXHAUSTED' ? 'Ya usaste este cupón.' : 'Ese cupón ya se usó todas las veces posibles.')
      }
    }
    throw error
  }
}
