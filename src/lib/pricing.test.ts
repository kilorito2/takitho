// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  computeQuote,
  evaluateCoupon,
  priceLine,
  validateModifierSelection,
  type CartLine,
  type PricingCoupon,
  type PricingGroup,
  type PricingProduct,
  type QuoteInput,
} from './pricing.ts'

const TZ = 'America/Argentina/Buenos_Aires'
const ba = (local: string): Date => new Date(`${local}:00-03:00`)
const TUESDAY_NIGHT = ba('2026-10-20T21:00') // Tuesday
const MONDAY_NIGHT = ba('2026-10-19T21:00')

const tortilla: PricingGroup = {
  id: 'g-tortilla',
  name: 'Tortilla',
  minSelect: 1,
  maxSelect: 1,
  isRequired: true,
  modifiers: [
    { id: 'm-maiz', name: 'Maíz', priceDelta: 0, isAvailable: true },
    { id: 'm-harina', name: 'Harina', priceDelta: 0, isAvailable: true },
  ],
}
const salsas: PricingGroup = {
  id: 'g-salsas',
  name: 'Salsas',
  minSelect: 0,
  maxSelect: 2,
  isRequired: false,
  modifiers: [
    { id: 'm-verde', name: 'Verde', priceDelta: 0, isAvailable: true },
    { id: 'm-roja', name: 'Roja', priceDelta: 0, isAvailable: true },
    { id: 'm-habanero', name: 'Habanero', priceDelta: 0, isAvailable: false },
  ],
}
const extras: PricingGroup = {
  id: 'g-extras',
  name: 'Extras',
  minSelect: 0,
  maxSelect: 3,
  isRequired: false,
  modifiers: [
    { id: 'm-queso', name: 'Queso', priceDelta: 800, isAvailable: true },
    { id: 'm-guac', name: 'Guacamole', priceDelta: 1200, isAvailable: true },
  ],
}

const pastor: PricingProduct = {
  id: 'p-pastor',
  name: 'Tacos al pastor',
  price: 6000,
  categoryId: 'c-tacos',
  isAvailable: true,
  groups: [tortilla, salsas, extras],
}
const asada: PricingProduct = {
  id: 'p-asada',
  name: 'Tacos de asada',
  price: 6500,
  categoryId: 'c-tacos',
  isAvailable: true,
  groups: [tortilla],
}
const horchata: PricingProduct = {
  id: 'p-horchata',
  name: 'Horchata',
  price: 2500,
  categoryId: 'c-bebidas',
  isAvailable: true,
  groups: [],
}
const agotado: PricingProduct = { ...horchata, id: 'p-agotado', name: 'Tamarindo', isAvailable: false }
const products = [pastor, asada, horchata, agotado]

const line = (productId: string, quantity = 1, modifierIds: string[] = [], note?: string): CartLine =>
  note === undefined ? { productId, quantity, modifierIds } : { productId, quantity, modifierIds, note }

const baseInput = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  products,
  lines: [line('p-pastor', 1, ['m-maiz'])],
  orderType: 'pickup',
  now: MONDAY_NIGHT,
  tz: TZ,
  ...over,
})

const coupon = (over: Partial<PricingCoupon> = {}): PricingCoupon => ({
  code: 'TACOS10',
  label: '10 % de descuento',
  kind: 'percent',
  value: 10,
  scope: 'all',
  scopeIds: [],
  weekdays: [],
  startsAt: null,
  endsAt: null,
  maxUses: null,
  usesCount: 0,
  maxUsesPerPhone: null,
  usesByPhone: 0,
  minPurchase: 0,
  isActive: true,
  ...over,
})

describe('validateModifierSelection', () => {
  it('accepts a valid selection and returns the chosen modifiers', () => {
    const r = validateModifierSelection(pastor, ['m-maiz', 'm-verde', 'm-roja', 'm-queso'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.map((m) => m.id)).toEqual(['m-maiz', 'm-verde', 'm-roja', 'm-queso'])
  })

  it('requires at least one option in a required group', () => {
    const r = validateModifierSelection(pastor, [])
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'INVALID_MODIFIERS', details: { groupId: 'g-tortilla', reason: 'too_few' } },
    })
  })

  it('treats a required group with min 0 as min 1', () => {
    const loose: PricingProduct = { ...asada, groups: [{ ...tortilla, minSelect: 0 }] }
    expect(validateModifierSelection(loose, []).ok).toBe(false)
  })

  it('rejects more options than the group allows', () => {
    const r = validateModifierSelection(pastor, ['m-maiz', 'm-harina'])
    expect(r).toMatchObject({ ok: false, error: { details: { groupId: 'g-tortilla', reason: 'too_many' } } })
  })

  it('allows an optional group to stay empty and enforces its max', () => {
    expect(validateModifierSelection(pastor, ['m-maiz']).ok).toBe(true)
    const r = validateModifierSelection(pastor, ['m-maiz', 'm-verde', 'm-roja', 'm-habanero'])
    expect(r.ok).toBe(false)
  })

  it('rejects a modifier that does not belong to the product', () => {
    const r = validateModifierSelection(asada, ['m-maiz', 'm-queso'])
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'INVALID_MODIFIERS', details: { modifierId: 'm-queso', reason: 'unknown' } },
    })
  })

  it('rejects duplicated modifiers', () => {
    const r = validateModifierSelection(pastor, ['m-maiz', 'm-queso', 'm-queso'])
    expect(r).toMatchObject({ ok: false, error: { details: { reason: 'duplicate' } } })
  })

  it('reports an out-of-stock modifier as unavailable, not as invalid', () => {
    const r = validateModifierSelection(pastor, ['m-maiz', 'm-habanero'])
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'ITEM_UNAVAILABLE', details: { modifierId: 'm-habanero' } },
    })
  })
})

describe('priceLine', () => {
  it('adds modifier deltas to the base price and multiplies by quantity', () => {
    const r = priceLine(pastor, line('p-pastor', 3, ['m-maiz', 'm-queso', 'm-guac']))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.unitTotal).toBe(6000 + 800 + 1200)
      expect(r.value.lineTotal).toBe(8000 * 3)
      expect(r.value.modifiers.map((m) => m.name)).toEqual(['Maíz', 'Queso', 'Guacamole'])
    }
  })

  it('keeps the customer note on the priced line', () => {
    const r = priceLine(asada, line('p-asada', 1, ['m-maiz'], 'sin cebolla porfa'))
    expect(r).toMatchObject({ ok: true, value: { note: 'sin cebolla porfa' } })
  })

  it('propagates modifier errors', () => {
    expect(priceLine(asada, line('p-asada', 1, []))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_MODIFIERS' },
    })
  })

  it('refuses a negative unit price', () => {
    const odd: PricingProduct = {
      ...asada,
      price: 100,
      groups: [
        {
          ...tortilla,
          modifiers: [{ id: 'm-x', name: 'Descuento raro', priceDelta: -500, isAvailable: true }],
        },
      ],
    }
    expect(priceLine(odd, line('p-asada', 1, ['m-x'])).ok).toBe(false)
  })
})

describe('computeQuote — basics', () => {
  it('prices a pickup order with modifiers', () => {
    const r = computeQuote(
      baseInput({ lines: [line('p-pastor', 2, ['m-maiz', 'm-queso']), line('p-horchata', 1)] }),
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.subtotal).toBe(2 * 6800 + 2500)
      expect(r.value).toMatchObject({ discount: 0, deliveryFee: 0, tip: 0, coupon: null, total: 16100 })
    }
  })

  it('rejects an empty cart', () => {
    expect(computeQuote(baseInput({ lines: [] }))).toMatchObject({ ok: false, error: { code: 'EMPTY_CART' } })
  })

  it.each([0, -1, 21, 1.5, Number.NaN])('rejects quantity %s', (quantity) => {
    expect(computeQuote(baseInput({ lines: [line('p-horchata', quantity)] }))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_QUANTITY' },
    })
  })

  it('rejects unknown products', () => {
    expect(computeQuote(baseInput({ lines: [line('p-fantasma')] }))).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_PRODUCT', details: { productIds: ['p-fantasma'] } },
    })
  })

  it('lists every unavailable product', () => {
    expect(computeQuote(baseInput({ lines: [line('p-agotado'), line('p-horchata')] }))).toMatchObject({
      ok: false,
      error: { code: 'ITEM_UNAVAILABLE', details: { productIds: ['p-agotado'] } },
    })
  })

  it('surfaces modifier errors of any line', () => {
    expect(computeQuote(baseInput({ lines: [line('p-pastor', 1, [])] }))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_MODIFIERS' },
    })
  })

  it('ignores any price the client tries to send (A4: tampering in DevTools)', () => {
    const forged = {
      productId: 'p-pastor',
      quantity: 1,
      modifierIds: ['m-maiz'],
      price: 1,
      unitTotal: 1,
      total: 1,
    } as unknown as CartLine
    const r = computeQuote(baseInput({ lines: [forged] }))
    expect(r).toMatchObject({ ok: true, value: { subtotal: 6000, total: 6000 } })
  })

  it('does not mutate its input', () => {
    const lines = [line('p-pastor', 1, ['m-maiz'])]
    const snapshot = JSON.stringify({ products, lines })
    computeQuote(baseInput({ lines }))
    expect(JSON.stringify({ products, lines })).toBe(snapshot)
  })
})

describe('computeQuote — delivery, tip, minimum order', () => {
  const zone = { id: 'z-centro', fee: 1500, minOrder: 7000 }

  it('adds the zone fee to delivery orders', () => {
    const r = computeQuote(
      baseInput({ orderType: 'delivery', zone, lines: [line('p-pastor', 2, ['m-maiz'])] }),
    )
    expect(r).toMatchObject({ ok: true, value: { subtotal: 12000, deliveryFee: 1500, total: 13500 } })
  })

  it('requires a zone for delivery', () => {
    expect(computeQuote(baseInput({ orderType: 'delivery' }))).toMatchObject({
      ok: false,
      error: { code: 'ZONE_REQUIRED' },
    })
  })

  it('does not charge delivery on pickup or dine-in even if a zone is sent', () => {
    expect(computeQuote(baseInput({ orderType: 'dine_in', zone }))).toMatchObject({
      ok: true,
      value: { deliveryFee: 0 },
    })
  })

  it('blocks orders under the zone minimum, measured after the discount', () => {
    const under = computeQuote(baseInput({ orderType: 'delivery', zone, lines: [line('p-horchata', 2)] }))
    expect(under).toMatchObject({
      ok: false,
      error: { code: 'BELOW_MIN_ORDER', details: { minOrder: 7000, missing: 2000 } },
    })
    const discounted = computeQuote(
      baseInput({
        orderType: 'delivery',
        zone,
        lines: [line('p-pastor', 1, ['m-maiz'])],
        coupon: coupon({ value: 20 }),
      }),
    )
    expect(discounted).toMatchObject({ ok: false, error: { code: 'BELOW_MIN_ORDER' } })
  })

  it('adds a valid tip', () => {
    expect(computeQuote(baseInput({ tip: 500 }))).toMatchObject({
      ok: true,
      value: { tip: 500, total: 6500 },
    })
  })

  it.each([-1, 10.5, 6001])('rejects tip %s', (tip) => {
    expect(computeQuote(baseInput({ tip }))).toMatchObject({ ok: false, error: { code: 'INVALID_TIP' } })
  })
})

describe('evaluateCoupon', () => {
  const lines = (n = 1) => [
    { productId: 'p-pastor', categoryId: 'c-tacos', unitTotal: 6000, quantity: n },
    { productId: 'p-horchata', categoryId: 'c-bebidas', unitTotal: 2500, quantity: n },
  ]
  const ctx = { now: MONDAY_NIGHT, tz: TZ }

  it('percent: rounds to the nearest peso', () => {
    const r = evaluateCoupon(
      coupon({ value: 15 }),
      [{ productId: 'x', categoryId: null, unitTotal: 3333, quantity: 1 }],
      ctx,
    )
    expect(r).toEqual({ ok: true, discount: 500 })
  })

  it('fixed: never discounts more than the eligible amount', () => {
    expect(evaluateCoupon(coupon({ kind: 'fixed', value: 1000 }), lines(), ctx)).toEqual({
      ok: true,
      discount: 1000,
    })
    expect(evaluateCoupon(coupon({ kind: 'fixed', value: 99999 }), lines(), ctx)).toEqual({
      ok: true,
      discount: 8500,
    })
  })

  it('2x1: gives away the cheapest half of the eligible units', () => {
    const three = [{ productId: 'a', categoryId: null, unitTotal: 1000, quantity: 3 }]
    expect(evaluateCoupon(coupon({ kind: 'two_for_one' }), three, ctx)).toEqual({ ok: true, discount: 1000 })
    const four = [{ productId: 'a', categoryId: null, unitTotal: 1000, quantity: 4 }]
    expect(evaluateCoupon(coupon({ kind: 'two_for_one' }), four, ctx)).toEqual({ ok: true, discount: 2000 })
  })

  it('2x1: picks the cheapest units across different lines', () => {
    const mixed = [
      { productId: 'a', categoryId: null, unitTotal: 2000, quantity: 1 },
      { productId: 'b', categoryId: null, unitTotal: 1000, quantity: 1 },
      { productId: 'c', categoryId: null, unitTotal: 1500, quantity: 1 },
      { productId: 'd', categoryId: null, unitTotal: 3000, quantity: 1 },
    ]
    expect(evaluateCoupon(coupon({ kind: 'two_for_one' }), mixed, ctx)).toEqual({
      ok: true,
      discount: 1000 + 1500,
    })
  })

  it('2x1 with a single unit gives nothing and is reported as not applicable', () => {
    const one = [{ productId: 'a', categoryId: null, unitTotal: 1000, quantity: 1 }]
    expect(evaluateCoupon(coupon({ kind: 'two_for_one' }), one, ctx)).toMatchObject({
      ok: false,
      reason: 'no_eligible_items',
    })
  })

  it('scope "category" only discounts items of that category', () => {
    const r = evaluateCoupon(coupon({ scope: 'category', scopeIds: ['c-tacos'], value: 50 }), lines(2), ctx)
    expect(r).toEqual({ ok: true, discount: 6000 })
  })

  it('scope "products" only discounts the listed products', () => {
    const r = evaluateCoupon(
      coupon({ scope: 'products', scopeIds: ['p-horchata'], value: 100 }),
      lines(1),
      ctx,
    )
    expect(r).toEqual({ ok: true, discount: 2500 })
  })

  it('fails with no_eligible_items when the cart has none of the scoped items', () => {
    const r = evaluateCoupon(coupon({ scope: 'category', scopeIds: ['c-postres'] }), lines(), ctx)
    expect(r).toMatchObject({ ok: false, reason: 'no_eligible_items' })
  })

  it('is invalid when inactive', () => {
    expect(evaluateCoupon(coupon({ isActive: false }), lines(), ctx)).toMatchObject({
      ok: false,
      reason: 'inactive',
    })
  })

  it('checks the validity window', () => {
    expect(evaluateCoupon(coupon({ startsAt: '2026-10-20T00:00:00-03:00' }), lines(), ctx)).toMatchObject({
      ok: false,
      reason: 'not_started',
    })
    expect(evaluateCoupon(coupon({ endsAt: '2026-10-19T20:00:00-03:00' }), lines(), ctx)).toMatchObject({
      ok: false,
      reason: 'expired',
    })
    expect(
      evaluateCoupon(
        coupon({ startsAt: '2026-10-01T00:00:00-03:00', endsAt: '2026-10-31T00:00:00-03:00' }),
        lines(),
        ctx,
      ).ok,
    ).toBe(true)
  })

  it('applies weekday rules on the business day, so "martes" still counts at 00:30 of Wednesday', () => {
    const tuesdayOnly = coupon({ weekdays: [2] })
    expect(evaluateCoupon(tuesdayOnly, lines(), { now: MONDAY_NIGHT, tz: TZ })).toMatchObject({
      ok: false,
      reason: 'wrong_day',
    })
    expect(evaluateCoupon(tuesdayOnly, lines(), { now: TUESDAY_NIGHT, tz: TZ }).ok).toBe(true)
    expect(evaluateCoupon(tuesdayOnly, lines(), { now: ba('2026-10-21T00:30'), tz: TZ }).ok).toBe(true)
    expect(evaluateCoupon(tuesdayOnly, lines(), { now: ba('2026-10-21T19:00'), tz: TZ })).toMatchObject({
      ok: false,
      reason: 'wrong_day',
    })
  })

  it('enforces total and per-phone usage limits', () => {
    expect(evaluateCoupon(coupon({ maxUses: 10, usesCount: 10 }), lines(), ctx)).toMatchObject({
      ok: false,
      reason: 'exhausted',
    })
    expect(evaluateCoupon(coupon({ maxUses: 10, usesCount: 9 }), lines(), ctx).ok).toBe(true)
    expect(evaluateCoupon(coupon({ maxUsesPerPhone: 1, usesByPhone: 1 }), lines(), ctx)).toMatchObject({
      ok: false,
      reason: 'phone_exhausted',
    })
  })

  it('enforces the minimum purchase on the whole cart', () => {
    expect(evaluateCoupon(coupon({ minPurchase: 9000 }), lines(), ctx)).toMatchObject({
      ok: false,
      reason: 'below_min',
      missing: 500,
    })
    expect(evaluateCoupon(coupon({ minPurchase: 8500 }), lines(), ctx).ok).toBe(true)
  })
})

describe('computeQuote — coupons', () => {
  it('subtracts the discount from the total and reports the coupon', () => {
    const r = computeQuote(baseInput({ coupon: coupon({ value: 10 }), tip: 200 }))
    expect(r).toMatchObject({
      ok: true,
      value: {
        subtotal: 6000,
        discount: 600,
        coupon: { code: 'TACOS10', kind: 'percent', label: '10 % de descuento' },
        total: 5600,
      },
    })
  })

  it('never applies the discount to delivery or tip', () => {
    const zone = { id: 'z', fee: 1500, minOrder: 0 }
    const r = computeQuote(
      baseInput({ orderType: 'delivery', zone, coupon: coupon({ kind: 'fixed', value: 6000 }), tip: 300 }),
    )
    expect(r).toMatchObject({ ok: true, value: { discount: 6000, deliveryFee: 1500, tip: 300, total: 1800 } })
  })

  it('explains how much is missing when the coupon needs a bigger order', () => {
    const r = computeQuote(baseInput({ coupon: coupon({ minPurchase: 8000 }) }))
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'INVALID_COUPON', details: { reason: 'below_min', missing: 2000 } },
    })
    if (!r.ok) expect(r.error.message).toContain('2.000')
  })

  it('turns an invalid coupon into an INVALID_COUPON error with a human message', () => {
    const r = computeQuote(baseInput({ coupon: coupon({ isActive: false }) }))
    expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_COUPON', details: { reason: 'inactive' } } })
    if (!r.ok) expect(r.error.message.length).toBeGreaterThan(10)
  })

  it('applies a Tuesday 2x1 on tacos only', () => {
    const martes = coupon({
      code: null,
      label: 'Martes de tacos 2x1',
      kind: 'two_for_one',
      scope: 'category',
      scopeIds: ['c-tacos'],
      weekdays: [2],
    })
    const lines = [line('p-pastor', 1, ['m-maiz']), line('p-asada', 1, ['m-maiz']), line('p-horchata', 2)]
    const r = computeQuote(baseInput({ lines, coupon: martes, now: TUESDAY_NIGHT }))
    expect(r).toMatchObject({
      ok: true,
      value: { subtotal: 6000 + 6500 + 5000, discount: 6000, total: 11500 },
    })
  })
})
