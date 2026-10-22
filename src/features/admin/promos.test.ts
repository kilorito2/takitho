import { describe, expect, it } from 'vitest'
import { couponFormSchema, couponToRow, describeCoupon, type CouponFormInput } from './promos'

const base: CouponFormInput = {
  code: 'bienvenida10',
  label: '10 % de bienvenida',
  kind: 'percent',
  value: '10',
  scope: 'all',
  categoryId: '',
  productIds: [],
  weekdays: [],
  startsAt: '',
  endsAt: '',
  maxUses: '',
  maxUsesPerPhone: '1',
  minPurchase: '',
  autoApply: false,
  isActive: true,
}

const issues = (over: Partial<CouponFormInput>) => {
  const r = couponFormSchema.safeParse({ ...base, ...over })
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('couponFormSchema', () => {
  it('accepts a plain percent coupon', () => {
    expect(issues({})).toEqual([])
  })

  it('needs a code unless it applies on its own', () => {
    expect(issues({ code: '' })).toEqual(['code'])
    expect(issues({ code: '', autoApply: true })).toEqual([])
  })

  it.each(['ab', 'con espacio', 'ñandú', 'x'.repeat(21)])('rejects the code %j', (code) => {
    expect(issues({ code })).toEqual(['code'])
  })

  it('keeps percentages between 1 and 100 and fixed amounts positive', () => {
    expect(issues({ value: '0' })).toEqual(['value'])
    expect(issues({ value: '101' })).toEqual(['value'])
    expect(issues({ kind: 'fixed', value: '' })).toEqual(['value'])
    expect(issues({ kind: 'fixed', value: '1500' })).toEqual([])
  })

  it('rejects decimals and negatives in numeric fields', () => {
    expect(issues({ value: '10,5' })).toEqual(['value'])
    expect(issues({ minPurchase: '-5' })).toEqual(['minPurchase'])
    expect(issues({ maxUses: 'diez' })).toEqual(['maxUses'])
  })

  it('needs the category or the products the scope points at', () => {
    expect(issues({ scope: 'category' })).toEqual(['categoryId'])
    expect(issues({ scope: 'category', categoryId: 'c1' })).toEqual([])
    expect(issues({ scope: 'products' })).toEqual(['productIds'])
    expect(issues({ scope: 'products', productIds: ['p1'] })).toEqual([])
  })

  it('does not allow a 2x1 over the whole menu', () => {
    expect(issues({ kind: 'two_for_one', value: '', scope: 'all' })).toEqual(['scope'])
    expect(issues({ kind: 'two_for_one', value: '', scope: 'category', categoryId: 'c1' })).toEqual([])
  })

  it('does not end before it starts', () => {
    expect(issues({ startsAt: '2026-10-20', endsAt: '2026-10-19' })).toEqual(['endsAt'])
    expect(issues({ startsAt: '2026-10-20', endsAt: '2026-10-20' })).toEqual([])
  })
})

describe('couponToRow', () => {
  const parse = (over: Partial<CouponFormInput>) => couponFormSchema.parse({ ...base, ...over })

  it('uppercases the code and normalises numbers', () => {
    expect(couponToRow(parse({}))).toMatchObject({
      code: 'BIENVENIDA10',
      kind: 'percent',
      value: 10,
      max_uses: null,
      max_uses_per_phone: 1,
      min_purchase: 0,
      scope_ids: [],
      auto_apply: false,
    })
  })

  it('stores automatic promos without a code', () => {
    expect(couponToRow(parse({ code: '', autoApply: true })).code).toBeNull()
  })

  it('points the scope at the right ids and zeroes the value of a 2x1', () => {
    const row = couponToRow(
      parse({ kind: 'two_for_one', value: '50', scope: 'products', productIds: ['p2', 'p1'] }),
    )
    expect(row).toMatchObject({ value: 0, scope: 'products', scope_ids: ['p2', 'p1'] })
    expect(
      couponToRow(parse({ scope: 'category', categoryId: 'c9', productIds: ['stale'] })).scope_ids,
    ).toEqual(['c9'])
  })

  it('runs promos through the end of their last day, in the shop time zone', () => {
    const row = couponToRow(parse({ startsAt: '2026-10-20', endsAt: '2026-10-31' }))
    expect(row.starts_at).toBe('2026-10-20T00:00:00-03:00')
    expect(row.ends_at).toBe('2026-10-31T23:59:59-03:00')
  })

  it('sorts weekdays', () => {
    expect(couponToRow(parse({ weekdays: [6, 1, 5] })).weekdays).toEqual([1, 5, 6])
  })
})

describe('describeCoupon', () => {
  it('summarises the rules in one line', () => {
    expect(
      describeCoupon({
        kind: 'percent',
        value: 20,
        weekdays: [5, 6],
        ends_at: '2026-10-31T23:59:59-03:00',
        min_purchase: 0,
      }),
    ).toBe('20 % de descuento · solo Vie, Sáb · hasta 31/10')
    expect(
      describeCoupon({ kind: 'two_for_one', value: 0, weekdays: [], ends_at: null, min_purchase: 0 }),
    ).toBe('2x1')
    expect(
      describeCoupon({
        kind: 'fixed',
        value: 1500,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        ends_at: null,
        min_purchase: 9000,
      }),
    ).toMatch(/^\$ 1\.500 de descuento · desde \$ 9\.000$/)
  })
})
