// Pure core (ADR-0004): the only place where a price is computed.
// The front uses it for the preview; the Edge Functions use the exact same file as the source of truth.
// It never reads a price from the cart: the caller passes the catalogue loaded from the database.
import { businessDate } from './hours.ts'
import { formatARS } from './money.ts'
import type { OrderType } from './orderStatus.ts'

export const MAX_LINE_QUANTITY = 20

/* ----------------------------- catalogue ----------------------------- */

export interface PricingModifier {
  id: string
  name: string
  priceDelta: number
  isAvailable: boolean
}

export interface PricingGroup {
  id: string
  name: string
  minSelect: number
  maxSelect: number
  isRequired: boolean
  modifiers: readonly PricingModifier[]
}

export interface PricingProduct {
  id: string
  name: string
  /** Whole ARS pesos. */
  price: number
  categoryId: string | null
  isAvailable: boolean
  groups: readonly PricingGroup[]
}

export type CouponKind = 'percent' | 'fixed' | 'two_for_one'

export interface PricingCoupon {
  code: string | null
  label: string
  kind: CouponKind
  /** percent: 1–100 · fixed: pesos · two_for_one: ignored. */
  value: number
  scope: 'all' | 'category' | 'products'
  scopeIds: readonly string[]
  /** 0 = Sunday … 6 = Saturday, evaluated on the business day. Empty = every day. */
  weekdays: readonly number[]
  startsAt: string | null
  endsAt: string | null
  maxUses: number | null
  usesCount: number
  maxUsesPerPhone: number | null
  usesByPhone: number
  minPurchase: number
  isActive: boolean
}

export interface PricingZone {
  id: string
  fee: number
  minOrder: number
}

/* ------------------------------ results ------------------------------ */

export type PricingErrorCode =
  | 'EMPTY_CART'
  | 'INVALID_QUANTITY'
  | 'UNKNOWN_PRODUCT'
  | 'ITEM_UNAVAILABLE'
  | 'INVALID_MODIFIERS'
  | 'INVALID_COUPON'
  | 'BELOW_MIN_ORDER'
  | 'INVALID_TIP'
  | 'ZONE_REQUIRED'

export interface PricingError {
  code: PricingErrorCode
  /** es-AR, ready to show. */
  message: string
  details?: Record<string, unknown>
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: PricingError }

const fail = (
  code: PricingErrorCode,
  message: string,
  details?: Record<string, unknown>,
): { ok: false; error: PricingError } => ({
  ok: false,
  error: details ? { code, message, details } : { code, message },
})

/* --------------------------- modifier rules --------------------------- */

export function validateModifierSelection(
  product: PricingProduct,
  modifierIds: readonly string[],
): Result<PricingModifier[]> {
  const owner = new Map<string, { group: PricingGroup; modifier: PricingModifier }>()
  for (const group of product.groups)
    for (const modifier of group.modifiers) owner.set(modifier.id, { group, modifier })

  const seen = new Set<string>()
  const chosen: PricingModifier[] = []
  const countByGroup = new Map<string, number>()
  for (const id of modifierIds) {
    if (seen.has(id))
      return fail('INVALID_MODIFIERS', 'Elegiste la misma opción dos veces.', {
        modifierId: id,
        reason: 'duplicate',
      })
    seen.add(id)
    const hit = owner.get(id)
    if (!hit)
      return fail('INVALID_MODIFIERS', 'Hay una opción que no corresponde a este producto.', {
        modifierId: id,
        reason: 'unknown',
      })
    if (!hit.modifier.isAvailable) {
      return fail('ITEM_UNAVAILABLE', `Se nos terminó ${hit.modifier.name} por hoy.`, {
        productId: product.id,
        modifierId: id,
      })
    }
    chosen.push(hit.modifier)
    countByGroup.set(hit.group.id, (countByGroup.get(hit.group.id) ?? 0) + 1)
  }

  for (const group of product.groups) {
    const count = countByGroup.get(group.id) ?? 0
    const min = group.isRequired ? Math.max(1, group.minSelect) : group.minSelect
    if (count < min) {
      return fail('INVALID_MODIFIERS', `Elegí al menos ${min} en "${group.name}".`, {
        groupId: group.id,
        reason: 'too_few',
        min,
      })
    }
    if (count > group.maxSelect) {
      return fail('INVALID_MODIFIERS', `En "${group.name}" podés elegir hasta ${group.maxSelect}.`, {
        groupId: group.id,
        reason: 'too_many',
        max: group.maxSelect,
      })
    }
  }
  return { ok: true, value: chosen }
}

/* ------------------------------ cart lines ------------------------------ */

export interface CartLine {
  productId: string
  quantity: number
  modifierIds: readonly string[]
  note?: string
}

export interface PricedLine {
  productId: string
  categoryId: string | null
  name: string
  unitTotal: number
  quantity: number
  lineTotal: number
  modifiers: { modifierId: string; name: string; priceDelta: number }[]
  note?: string
}

export function priceLine(product: PricingProduct, line: CartLine): Result<PricedLine> {
  const selection = validateModifierSelection(product, line.modifierIds)
  if (!selection.ok) return selection
  const unitTotal = product.price + selection.value.reduce((sum, m) => sum + m.priceDelta, 0)
  if (unitTotal < 0)
    return fail('INVALID_MODIFIERS', 'La combinación elegida no es válida.', { reason: 'negative_total' })
  const priced: PricedLine = {
    productId: product.id,
    categoryId: product.categoryId,
    name: product.name,
    unitTotal,
    quantity: line.quantity,
    lineTotal: unitTotal * line.quantity,
    modifiers: selection.value.map((m) => ({ modifierId: m.id, name: m.name, priceDelta: m.priceDelta })),
  }
  if (line.note !== undefined) priced.note = line.note
  return { ok: true, value: priced }
}

/* -------------------------------- coupons -------------------------------- */

export interface EligibleLine {
  productId: string
  categoryId: string | null
  unitTotal: number
  quantity: number
}

export type CouponFailReason =
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'wrong_day'
  | 'exhausted'
  | 'phone_exhausted'
  | 'below_min'
  | 'no_eligible_items'

export type CouponEvaluation =
  | { ok: true; discount: number }
  | { ok: false; reason: Exclude<CouponFailReason, 'below_min'> }
  | { ok: false; reason: 'below_min'; missing: number }

function discountFor(
  coupon: PricingCoupon,
  eligible: readonly EligibleLine[],
  eligibleSubtotal: number,
): number {
  if (coupon.kind === 'percent') return Math.round((eligibleSubtotal * coupon.value) / 100)
  if (coupon.kind === 'fixed') return Math.min(coupon.value, eligibleSubtotal)
  // 2x1: every second unit is free, and the free ones are the cheapest.
  const units = eligible
    .flatMap((l) => Array.from({ length: l.quantity }, () => l.unitTotal))
    .sort((a, b) => a - b)
  return units.slice(0, Math.floor(units.length / 2)).reduce((sum, u) => sum + u, 0)
}

export function evaluateCoupon(
  coupon: PricingCoupon,
  lines: readonly EligibleLine[],
  ctx: { now: Date; tz: string },
): CouponEvaluation {
  if (!coupon.isActive) return { ok: false, reason: 'inactive' }
  const t = ctx.now.getTime()
  if (coupon.startsAt !== null && t < Date.parse(coupon.startsAt)) return { ok: false, reason: 'not_started' }
  if (coupon.endsAt !== null && t >= Date.parse(coupon.endsAt)) return { ok: false, reason: 'expired' }
  if (coupon.weekdays.length > 0) {
    const weekday = new Date(`${businessDate(ctx.now, ctx.tz)}T00:00:00Z`).getUTCDay()
    if (!coupon.weekdays.includes(weekday)) return { ok: false, reason: 'wrong_day' }
  }
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) return { ok: false, reason: 'exhausted' }
  if (coupon.maxUsesPerPhone !== null && coupon.usesByPhone >= coupon.maxUsesPerPhone)
    return { ok: false, reason: 'phone_exhausted' }

  const subtotal = lines.reduce((sum, l) => sum + l.unitTotal * l.quantity, 0)
  if (subtotal < coupon.minPurchase)
    return { ok: false, reason: 'below_min', missing: coupon.minPurchase - subtotal }

  const eligible = lines.filter((l) => {
    if (coupon.scope === 'all') return true
    if (coupon.scope === 'category') return l.categoryId !== null && coupon.scopeIds.includes(l.categoryId)
    return coupon.scopeIds.includes(l.productId)
  })
  const eligibleSubtotal = eligible.reduce((sum, l) => sum + l.unitTotal * l.quantity, 0)

  const discount = discountFor(coupon, eligible, eligibleSubtotal)
  if (discount <= 0) return { ok: false, reason: 'no_eligible_items' }
  return { ok: true, discount }
}

const COUPON_MESSAGES: Record<Exclude<CouponFailReason, 'below_min'>, string> = {
  inactive: 'Ese cupón ya no está activo.',
  not_started: 'Ese cupón todavía no empezó.',
  expired: 'Ese cupón venció.',
  wrong_day: 'Ese cupón no vale hoy.',
  exhausted: 'Ese cupón ya se usó todas las veces posibles.',
  phone_exhausted: 'Ya usaste este cupón.',
  no_eligible_items: 'Este cupón no aplica a lo que pediste.',
}

/* -------------------------------- quote -------------------------------- */

export interface QuoteInput {
  products: readonly PricingProduct[]
  lines: readonly CartLine[]
  orderType: OrderType
  zone?: PricingZone | null
  coupon?: PricingCoupon | null
  tip?: number
  now: Date
  tz: string
}

export interface Quote {
  lines: PricedLine[]
  subtotal: number
  discount: number
  coupon: { code: string | null; kind: CouponKind; label: string } | null
  deliveryFee: number
  tip: number
  total: number
}

export function computeQuote(input: QuoteInput): Result<Quote> {
  const { products, lines, orderType, zone = null, coupon = null, tip = 0, now, tz } = input
  if (lines.length === 0) return fail('EMPTY_CART', 'Tu bandeja está vacía.')

  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_LINE_QUANTITY) {
      return fail('INVALID_QUANTITY', `La cantidad tiene que estar entre 1 y ${MAX_LINE_QUANTITY}.`, {
        productId: l.productId,
      })
    }
  }

  const byId = new Map(products.map((p) => [p.id, p]))
  const resolved: { line: CartLine; product: PricingProduct }[] = []
  const unknown: string[] = []
  const unavailable: string[] = []
  for (const l of lines) {
    const product = byId.get(l.productId)
    if (!product) unknown.push(l.productId)
    else {
      if (!product.isAvailable) unavailable.push(l.productId)
      resolved.push({ line: l, product })
    }
  }
  if (unknown.length > 0)
    return fail('UNKNOWN_PRODUCT', 'Hay productos que ya no están en el menú.', { productIds: unknown })
  if (unavailable.length > 0)
    return fail('ITEM_UNAVAILABLE', 'Algunos productos se agotaron por hoy.', { productIds: unavailable })

  const priced: PricedLine[] = []
  for (const { line, product } of resolved) {
    const r = priceLine(product, line)
    if (!r.ok) return r
    priced.push(r.value)
  }
  const subtotal = priced.reduce((sum, l) => sum + l.lineTotal, 0)

  if (orderType === 'delivery' && !zone) return fail('ZONE_REQUIRED', 'Elegí la zona de entrega.')

  let discount = 0
  let couponInfo: Quote['coupon'] = null
  if (coupon) {
    const evaluation = evaluateCoupon(coupon, priced, { now, tz })
    if (!evaluation.ok) {
      if (evaluation.reason === 'below_min') {
        return fail('INVALID_COUPON', `Para usar el cupón te faltan ${formatARS(evaluation.missing)}.`, {
          reason: 'below_min',
          missing: evaluation.missing,
        })
      }
      return fail('INVALID_COUPON', COUPON_MESSAGES[evaluation.reason], { reason: evaluation.reason })
    }
    discount = Math.min(evaluation.discount, subtotal)
    couponInfo = { code: coupon.code, kind: coupon.kind, label: coupon.label }
  }

  const deliveryFee = orderType === 'delivery' && zone ? zone.fee : 0
  if (orderType === 'delivery' && zone && subtotal - discount < zone.minOrder) {
    const missing = zone.minOrder - (subtotal - discount)
    return fail(
      'BELOW_MIN_ORDER',
      `El pedido mínimo para esta zona es ${formatARS(zone.minOrder)}. Te faltan ${formatARS(missing)}.`,
      {
        minOrder: zone.minOrder,
        missing,
      },
    )
  }

  if (!Number.isInteger(tip) || tip < 0 || tip > subtotal)
    return fail('INVALID_TIP', 'La propina no es válida.', { tip })

  return {
    ok: true,
    value: {
      lines: priced,
      subtotal,
      discount,
      coupon: couponInfo,
      deliveryFee,
      tip,
      total: subtotal - discount + deliveryFee + tip,
    },
  }
}
