// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '@/lib/api'
import type { CartItem } from '@/features/cart/store'
import type { CreateOrderResponse } from '@/types/api'
import { defaultValues, type CheckoutValues } from './schema'
import { buildCreateRequest, orderShape, stepForError, submitOrder, type OrderContext } from './submit'

const item: CartItem = {
  id: 'l1',
  productId: 'p1',
  quantity: 2,
  modifierIds: ['m1'],
  note: 'sin cebolla',
  snapshot: { name: 'Tacos', unitPrice: 7200, imagePublicId: null, modifierNames: [] },
}
const ctx = (over: Partial<CheckoutValues> = {}, extra: Partial<OrderContext> = {}): OrderContext => ({
  items: [item],
  values: defaultValues({ name: ' Ana Pérez ', phone: '11 1234-5678', ...over }),
  couponCode: null,
  tableNumber: null,
  tip: 0,
  ...extra,
})
const created = (action: 'track' | 'pay_mercado_pago'): CreateOrderResponse => ({
  order: {
    id: 'o1',
    code: 'TK-0427',
    public_token: 't'.repeat(64),
    status: action === 'track' ? 'received' : 'pending_payment',
    payment_status: 'pending',
    total: 14400,
    estimated_minutes: 25,
  },
  next: { action },
  replayed: false,
})
/** The mock behind the last `fakeApi()`; asserted on directly so the method is never read off the client. */
let call = vi.fn()
const fakeApi = (handlers: Record<string, () => unknown>): ApiClient => {
  call = vi.fn((name: string) => {
    const h = handlers[name]
    if (!h) return Promise.reject(new Error(`unexpected call ${name}`))
    try {
      return Promise.resolve(h())
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
  return { call } as never
}

describe('buildCreateRequest', () => {
  it('sends ids, choices and the idempotency key — never a price', () => {
    const r = buildCreateRequest(ctx({ method: 'cash', cashPaidWith: '20.000' }), 'key-1')
    expect(r).toMatchObject({
      idempotency_key: 'key-1',
      items: [{ product_id: 'p1', quantity: 2, modifier_ids: ['m1'], note: 'sin cebolla' }],
      type: 'pickup',
      schedule: { mode: 'asap' },
      customer: { name: 'Ana Pérez', phone: '11 1234-5678' },
      payment: { method: 'cash', cash_paid_with: 20000 },
    })
    expect(JSON.stringify(r)).not.toMatch(/price|total|unit/i)
  })

  it('omits cash_paid_with unless paying cash with an amount, and passes the honeypot/captcha through', () => {
    expect(buildCreateRequest(ctx({ method: 'transfer', cashPaidWith: '5000' }), 'k').payment).toEqual({
      method: 'transfer',
    })
    expect(buildCreateRequest(ctx({ method: 'cash', cashPaidWith: '' }), 'k').payment).toEqual({
      method: 'cash',
    })
    expect(buildCreateRequest(ctx({ website: 'bot' }, { turnstileToken: 'tok' }), 'k')).toMatchObject({
      website: 'bot',
      turnstile_token: 'tok',
    })
  })

  it('shapes delivery, dine-in and scheduled orders', () => {
    const delivery = buildCreateRequest(
      ctx({ type: 'delivery', zoneId: 'z1', street: 'Av. Siempreviva', number: '742', floorApt: '3B' }),
      'k',
    )
    expect(delivery.delivery).toEqual({
      zone_id: 'z1',
      street: 'Av. Siempreviva',
      number: '742',
      floor_apt: '3B',
    })
    expect(buildCreateRequest(ctx({ type: 'dine_in' }, { tableNumber: 3 }), 'k').table_number).toBe(3)
    const scheduled = orderShape(ctx({ whenMode: 'scheduled', slot: '2026-10-20T22:30:00.000Z' }))
    expect(scheduled.scheduledAt).toBe('2026-10-20T22:30:00.000Z')
    expect(buildCreateRequest(ctx({}, { tip: 500, couponCode: 'MARTES' }), 'k')).toMatchObject({
      tip: 500,
      coupon_code: 'MARTES',
    })
  })
})

describe('submitOrder', () => {
  const request = buildCreateRequest(ctx(), 'key-1')

  it('goes straight to tracking for cash and transfer orders', async () => {
    const api = fakeApi({ 'create-order': () => created('track') })
    const r = await submitOrder(api, request)
    expect(r).toMatchObject({ kind: 'tracked', paymentError: null, order: { code: 'TK-0427' } })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('creates the Mercado Pago preference and returns its checkout URL', async () => {
    const api = fakeApi({
      'create-order': () => created('pay_mercado_pago'),
      'create-mp-preference': () => ({ init_point: 'https://mp.test/x', preference_id: 'p' }),
    })
    const r = await submitOrder(api, request)
    expect(r).toMatchObject({ kind: 'redirect', url: 'https://mp.test/x' })
    expect(call).toHaveBeenLastCalledWith('create-mp-preference', {
      order_code: 'TK-0427',
      public_token: 't'.repeat(64),
    })
  })

  it('keeps the created order when Mercado Pago cannot be opened (the tracking page offers a retry)', async () => {
    const api = fakeApi({
      'create-order': () => created('pay_mercado_pago'),
      'create-mp-preference': () => {
        throw new ApiError('MP_UNAVAILABLE', 'No pudimos conectar con Mercado Pago.', 502)
      },
    })
    const r = await submitOrder(api, request)
    expect(r).toMatchObject({
      kind: 'tracked',
      order: { code: 'TK-0427' },
      paymentError: { code: 'MP_UNAVAILABLE' },
    })
  })

  it('returns server errors with the step where they can be fixed', async () => {
    const closed = fakeApi({
      'create-order': () => {
        throw new ApiError('STORE_CLOSED', 'Estamos cerrados, prendemos el comal a las 19 h.', 409)
      },
    })
    expect(await submitOrder(closed, request)).toMatchObject({
      kind: 'error',
      step: 1,
      error: { message: 'Estamos cerrados, prendemos el comal a las 19 h.' },
    })
    const gone = fakeApi({
      'create-order': () => {
        throw new ApiError('ITEM_UNAVAILABLE', 'Algunos productos se agotaron por hoy.', 409)
      },
    })
    expect(await submitOrder(gone, request)).toMatchObject({ kind: 'error', step: null })
  })

  it('propagates unexpected (non-API) failures instead of hiding them', async () => {
    const api = fakeApi({
      'create-order': () => {
        throw new Error('boom')
      },
    })
    await expect(submitOrder(api, request)).rejects.toThrow('boom')
  })
})

describe('stepForError', () => {
  it.each([
    ['BELOW_MIN_ORDER', 0],
    ['INVALID_TABLE', 0],
    ['INVALID_SLOT', 1],
    ['STORE_PAUSED', 1],
    ['VALIDATION_ERROR', 2],
    ['INVALID_CASH', 3],
    ['PAYMENT_METHOD_DISABLED', 3],
  ] as const)('%s → step %s', (code, step) => {
    expect(stepForError(code)).toBe(step)
  })

  it('has no step for errors that are not about a step', () => {
    for (const code of ['RATE_LIMITED', 'NETWORK', 'INTERNAL', 'ITEM_UNAVAILABLE', 'INVALID_COUPON'] as const)
      expect(stepForError(code)).toBeNull()
  })
})
