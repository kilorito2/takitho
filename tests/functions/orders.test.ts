// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  handleCreateOrder,
  handleGetOrder,
  handleQuoteOrder,
} from '../../supabase/functions/_shared/handlers/orders.ts'
import { withHttp } from '../../supabase/functions/_shared/http.ts'
import { RepoError, type StoredOrder } from '../../supabase/functions/_shared/ports.ts'
import { CLOSED_NOW, ID, KEY, ba, coupon, makeHarness, orderBody, post, urlOf, zone } from './testkit.ts'

const body = async (res: Response): Promise<unknown> => res.json()
/** Reads a nested value ("lines.0.name") from parsed JSON without resorting to `any`. */
const pick = (value: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      value,
    )

const create = (h = makeHarness(), payload: unknown = orderBody()) => ({
  h,
  run: () => handleCreateOrder(post(payload), h.deps),
})

describe('quote-order', () => {
  it('returns the server-computed totals with line detail', async () => {
    const h = makeHarness()
    const res = await handleQuoteOrder(
      post({
        items: [{ product_id: ID.pastor, quantity: 2, modifier_ids: [ID.maiz, ID.queso] }],
        type: 'pickup',
        schedule: { mode: 'asap' },
      }),
      h.deps,
    )
    expect(res.status).toBe(200)
    const q = await body(res)
    expect(q).toMatchObject({
      subtotal: 16200,
      discount: 0,
      delivery_fee: 0,
      tip: 0,
      total: 16200,
      estimated_minutes: 25,
      store: { open: true, paused: false },
    })
    expect(pick(q, 'lines.0')).toMatchObject({
      product_id: ID.pastor,
      name: 'Tacos al pastor con piña',
      unit_total: 8100,
      quantity: 2,
      line_total: 16200,
    })
    expect((pick(q, 'lines.0.modifiers') as { name: string }[]).map((m) => m.name)).toEqual([
      'Maíz',
      'Queso extra',
    ])
  })

  it('does not block when the shop is closed: it reports the state instead', async () => {
    const h = makeHarness({ now: CLOSED_NOW })
    const res = await handleQuoteOrder(
      post({ items: [{ product_id: ID.horchata, quantity: 1 }], type: 'pickup', schedule: { mode: 'asap' } }),
      h.deps,
    )
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({
      store: { open: false, next_open_at: ba('2026-10-19T19:00').toISOString() },
    })
  })

  it('adds the delivery fee and enforces the zone minimum', async () => {
    const h = makeHarness()
    const ok = await handleQuoteOrder(
      post({
        items: [{ product_id: ID.asada, quantity: 1, modifier_ids: [ID.maiz] }],
        type: 'delivery',
        delivery: { zone_id: ID.zone, street: 'Av. Siempreviva', number: '742' },
        schedule: { mode: 'asap' },
      }),
      h.deps,
    )
    expect(await body(ok)).toMatchObject({
      subtotal: 7800,
      delivery_fee: 1500,
      total: 9300,
      estimated_minutes: 40,
    })
    const low = handleQuoteOrder(
      post({
        items: [{ product_id: ID.horchata, quantity: 1 }],
        type: 'delivery',
        delivery: { zone_id: ID.zone, street: 'Av. Siempreviva', number: '742' },
        schedule: { mode: 'asap' },
      }),
      h.deps,
    )
    await expect(low).rejects.toMatchObject({ code: 'BELOW_MIN_ORDER', status: 422 })
    expect(zone.minOrder).toBe(7000)
  })

  it('applies the Tuesday 2x1 automatically, but only on Tuesday', async () => {
    const martes = coupon({
      code: null,
      label: 'Martes de tacos 2x1',
      kind: 'two_for_one',
      scope: 'category',
      scopeIds: [ID.catTacos],
      weekdays: [2],
    })
    const items = [
      { product_id: ID.pastor, quantity: 1, modifier_ids: [ID.maiz] },
      { product_id: ID.asada, quantity: 1, modifier_ids: [ID.maiz] },
    ]
    const input = { items, type: 'pickup', schedule: { mode: 'asap' } }
    const tuesday = makeHarness({ now: ba('2026-10-20T21:00'), state: { coupons: [martes] } })
    expect(await body(await handleQuoteOrder(post(input), tuesday.deps))).toMatchObject({
      discount: 7200,
      total: 7800,
      coupon: { label: 'Martes de tacos 2x1' },
    })
    const monday = makeHarness({ state: { coupons: [martes] } })
    expect(await body(await handleQuoteOrder(post(input), monday.deps))).toMatchObject({
      discount: 0,
      coupon: null,
    })
  })

  it('lets a typed code win over an automatic promo, and rejects unknown codes', async () => {
    const auto = coupon({ code: null, label: 'Auto', kind: 'percent', value: 50 })
    const typed = coupon({ code: 'TACOS10', value: 10 })
    const h = makeHarness({ state: { coupons: [auto, typed] } })
    const input = {
      items: [{ product_id: ID.horchata, quantity: 1 }],
      type: 'pickup',
      schedule: { mode: 'asap' },
    }
    expect(
      await body(await handleQuoteOrder(post({ ...input, coupon_code: 'tacos10' }), h.deps)),
    ).toMatchObject({ discount: 320 })
    await expect(handleQuoteOrder(post({ ...input, coupon_code: 'NOEXISTE' }), h.deps)).rejects.toMatchObject(
      { code: 'INVALID_COUPON', status: 422 },
    )
  })

  it('rate-limits by IP', async () => {
    const h = makeHarness({
      config: { limits: { createIp: 5, createPhone: 3, quoteIp: 2, getOrderIp: 120, windowSeconds: 600 } },
    })
    const input = {
      items: [{ product_id: ID.horchata, quantity: 1 }],
      type: 'pickup',
      schedule: { mode: 'asap' },
    }
    expect((await handleQuoteOrder(post(input), h.deps)).status).toBe(200)
    expect((await handleQuoteOrder(post(input), h.deps)).status).toBe(200)
    await expect(handleQuoteOrder(post(input), h.deps)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retry_after_s: 321 },
    })
  })
})

describe('create-order — the server is the only source of truth (A4)', () => {
  it('recomputes every price and ignores whatever the client claims', async () => {
    const forged = orderBody({
      total: 1,
      subtotal: 1,
      discount: 99999,
      items: [
        {
          product_id: ID.pastor,
          quantity: 2,
          modifier_ids: [ID.maiz, ID.queso],
          price: 1,
          unit_price: 1,
          unit_total: 1,
          line_total: 1,
        },
      ],
    })
    const { h, run } = create(makeHarness(), forged)
    const res = await run()
    expect(res.status).toBe(201)
    const payload = h.state.orders[0]?.payload
    expect(payload?.totals).toEqual({ subtotal: 16200, delivery_fee: 0, discount: 0, tip: 0, total: 16200 })
    expect(payload?.items[0]).toMatchObject({
      name: 'Tacos al pastor con piña',
      unit_price: 8100,
      quantity: 2,
      line_total: 16200,
    })
  })

  it('creates a cash order that goes straight to the kitchen', async () => {
    const { h, run } = create()
    const res = await run()
    const data = await body(res)
    expect(res.status).toBe(201)
    expect(data).toMatchObject({
      order: { code: 'TK-0001', status: 'received', total: 16200, estimated_minutes: 25 },
      next: { action: 'track' },
      replayed: false,
    })
    expect(h.state.orders[0]?.payload).toMatchObject({
      initial_status: 'received',
      type: 'pickup',
      business_date: '2026-10-19',
      customer: { name: 'Ana Pérez', phone: '+5491112345678' },
      payment: { method: 'cash', cash_paid_with: 20000 },
    })
  })

  it('holds Mercado Pago orders in pending_payment and tells the client to pay', async () => {
    const { h, run } = create(makeHarness(), orderBody({ payment: { method: 'mercado_pago' } }))
    const data = await body(await run())
    expect(h.state.orders[0]?.payload.initial_status).toBe('pending_payment')
    expect(pick(data, 'next')).toEqual({ action: 'pay_mercado_pago' })
  })

  it('stores a delivery order with its zone, address and fee', async () => {
    const { h, run } = create(
      makeHarness(),
      orderBody({
        type: 'delivery',
        delivery: { zone_id: ID.zone, street: 'Av. Siempreviva', number: '742', floor_apt: '3B' },
        payment: { method: 'transfer' },
      }),
    )
    expect((await run()).status).toBe(201)
    expect(h.state.orders[0]?.payload).toMatchObject({
      zone_id: ID.zone,
      delivery: { street: 'Av. Siempreviva', number: '742', floor_apt: '3B' },
      totals: { delivery_fee: 1500, total: 17700 },
    })
  })

  it('resolves the dine-in table from the QR number and refuses unknown tables', async () => {
    const ok = create(makeHarness(), orderBody({ type: 'dine_in', table_number: 3 }))
    expect((await ok.run()).status).toBe(201)
    expect(ok.h.state.orders[0]?.payload.table_id).toBe(ID.table)
    const bad = create(makeHarness(), orderBody({ type: 'dine_in', table_number: 99 }))
    await expect(bad.run()).rejects.toMatchObject({ code: 'INVALID_TABLE' })
  })

  it('sanitises notes and keeps the rest of the order intact', async () => {
    const { h, run } = create(
      makeHarness(),
      orderBody({
        items: [
          {
            product_id: ID.pastor,
            quantity: 1,
            modifier_ids: [ID.maiz],
            note: '  sin <script>alert(1)</script>\n\n cebolla  ',
          },
        ],
      }),
    )
    await run()
    expect(h.state.orders[0]?.payload.items[0]?.note).toBe('sin scriptalert(1)/script cebolla')
  })

  it.each([
    ['unavailable product', { items: [{ product_id: ID.agotado, quantity: 1 }] }, 'ITEM_UNAVAILABLE'],
    [
      'unknown product',
      { items: [{ product_id: '99999999-0000-4000-8000-000000000000', quantity: 1 }] },
      'ITEM_UNAVAILABLE',
    ],
    [
      'missing required modifier',
      { items: [{ product_id: ID.pastor, quantity: 1, modifier_ids: [] }] },
      'INVALID_MODIFIERS',
    ],
    [
      'modifier of another product',
      { items: [{ product_id: ID.asada, quantity: 1, modifier_ids: [ID.maiz, ID.queso] }] },
      'INVALID_MODIFIERS',
    ],
    [
      'cash that does not cover the total',
      { payment: { method: 'cash', cash_paid_with: 100 } },
      'INVALID_CASH',
    ],
    ['absurd tip', { tip: 999999 }, 'VALIDATION_ERROR'],
    ['quantity above the cap', { items: [{ product_id: ID.horchata, quantity: 21 }] }, 'VALIDATION_ERROR'],
    ['missing address for delivery', { type: 'delivery' }, 'VALIDATION_ERROR'],
    ['missing table for dine-in', { type: 'dine_in' }, 'VALIDATION_ERROR'],
    ['invalid phone', { customer: { name: 'Ana', phone: '12345' } }, 'VALIDATION_ERROR'],
  ])('rejects %s', async (_name, over, code) => {
    await expect(create(makeHarness(), orderBody(over)).run()).rejects.toMatchObject({ code })
  })

  it('rejects a payment method the owner turned off', async () => {
    const h = makeHarness()
    h.state.settings.payMpEnabled = false
    await expect(create(h, orderBody({ payment: { method: 'mercado_pago' } })).run()).rejects.toMatchObject({
      code: 'PAYMENT_METHOD_DISABLED',
    })
  })
})

describe('create-order — hours, pause and scheduling (A5)', () => {
  it('blocks immediate orders when closed, telling when the comal is lit again', async () => {
    const { run } = create(makeHarness({ now: CLOSED_NOW }))
    await expect(run()).rejects.toMatchObject({
      code: 'STORE_CLOSED',
      message: 'Estamos cerrados, prendemos el comal a las 19 h.',
      details: { next_open_at: ba('2026-10-19T19:00').toISOString(), can_schedule: true },
    })
  })

  it("stays open past midnight with the previous night's shift", async () => {
    const { run } = create(makeHarness({ now: ba('2026-10-20T00:30') }))
    expect((await run()).status).toBe(201)
  })

  it('blocks immediate orders while paused, but still accepts scheduled ones', async () => {
    const paused = makeHarness()
    paused.state.settings.isPaused = true
    await expect(create(paused).run()).rejects.toMatchObject({ code: 'STORE_PAUSED' })
    const scheduled = create(
      paused,
      orderBody({ schedule: { mode: 'scheduled', at: ba('2026-10-19T22:30').toISOString() } }),
    )
    const res = await scheduled.run()
    expect(res.status).toBe(201)
    expect(paused.state.orders[0]?.payload).toMatchObject({
      scheduled_for: ba('2026-10-19T22:30').toISOString(),
      estimated_minutes: null,
    })
  })

  it('accepts a slot for when it opens, and rejects off-grid, past or out-of-hours slots', async () => {
    const closed = makeHarness({
      now: CLOSED_NOW,
      config: { limits: { createIp: 99, createPhone: 99, quoteIp: 60, getOrderIp: 120, windowSeconds: 600 } },
    })
    const ok = await create(
      closed,
      orderBody({ schedule: { mode: 'scheduled', at: ba('2026-10-19T19:30').toISOString() } }),
    ).run()
    expect(ok.status).toBe(201)
    for (const at of ['2026-10-19T19:10', '2026-10-19T12:30', '2026-10-19T15:00']) {
      await expect(
        create(closed, orderBody({ schedule: { mode: 'scheduled', at: ba(at).toISOString() } })).run(),
      ).rejects.toMatchObject({ code: 'INVALID_SLOT' })
    }
  })

  it('refuses everything on a manual closure unless scheduling is allowed', async () => {
    const h = makeHarness()
    h.state.settings.isClosedManually = true
    await expect(create(h).run()).rejects.toMatchObject({ code: 'STORE_CLOSED' })
    await expect(
      create(
        h,
        orderBody({ schedule: { mode: 'scheduled', at: ba('2026-10-19T22:00').toISOString() } }),
      ).run(),
    ).rejects.toMatchObject({ code: 'STORE_CLOSED' })
  })
})

describe('create-order — idempotency, abuse protection', () => {
  it('replays the same order for the same key and payload without consuming rate limit or creating twice', async () => {
    const h = makeHarness()
    const input = orderBody({ idempotency_key: KEY })
    const first = await handleCreateOrder(post(input), h.deps)
    const rateBefore = [...h.state.rate.values()].reduce((a, b) => a + b, 0)
    const again = await handleCreateOrder(post(input), h.deps)
    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect(await body(again)).toMatchObject({ replayed: true, order: { code: 'TK-0001' } })
    expect(h.state.orders).toHaveLength(1)
    expect([...h.state.rate.values()].reduce((a, b) => a + b, 0)).toBe(rateBefore)
  })

  it('treats the same key with another cart as a client bug', async () => {
    const h = makeHarness()
    await handleCreateOrder(post(orderBody({ idempotency_key: KEY })), h.deps)
    const other = orderBody({ idempotency_key: KEY, items: [{ product_id: ID.horchata, quantity: 1 }] })
    await expect(handleCreateOrder(post(other), h.deps)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    })
  })

  it('hashes the same order identically regardless of phone formatting or key order', async () => {
    const h = makeHarness()
    await handleCreateOrder(post(orderBody({ idempotency_key: KEY })), h.deps)
    const reformatted = orderBody({
      idempotency_key: KEY,
      customer: { phone: '+54 9 11 1234-5678', name: 'Ana Pérez' },
    })
    expect((await handleCreateOrder(post(reformatted), h.deps)).status).toBe(200)
  })

  it('limits orders per IP and per phone, answering 429 with the wait time', async () => {
    const h = makeHarness({
      config: { limits: { createIp: 2, createPhone: 3, quoteIp: 60, getOrderIp: 120, windowSeconds: 600 } },
    })
    await handleCreateOrder(post(orderBody()), h.deps)
    await handleCreateOrder(post(orderBody()), h.deps)
    await expect(handleCreateOrder(post(orderBody()), h.deps)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retry_after_s: 321 },
    })
    const byPhone = makeHarness({
      config: { limits: { createIp: 99, createPhone: 1, quoteIp: 60, getOrderIp: 120, windowSeconds: 600 } },
    })
    await handleCreateOrder(post(orderBody()), byPhone.deps)
    await expect(handleCreateOrder(post(orderBody()), byPhone.deps)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
  })

  it('stores neither the IP nor the phone in the rate-limit keys', async () => {
    const h = makeHarness()
    await handleCreateOrder(post(orderBody()), h.deps)
    for (const key of h.state.rate.keys()) {
      expect(key).not.toContain('203.0.113.9')
      expect(key).not.toContain('5491112345678')
    }
  })

  it('fakes success for the honeypot and creates nothing', async () => {
    const h = makeHarness()
    const res = await handleCreateOrder(post(orderBody({ website: 'http://spam.example' })), h.deps)
    expect(res.status).toBe(201)
    expect(h.state.orders).toHaveLength(0)
  })

  it('requires a valid Turnstile token only when a secret is configured', async () => {
    const calls: string[] = []
    const fetchOk: typeof fetch = (input) => {
      calls.push(urlOf(input))
      return Promise.resolve(new Response(JSON.stringify({ success: true })))
    }
    const h = makeHarness({ config: { turnstileSecret: 'ts-secret' }, fetch: fetchOk })
    await expect(handleCreateOrder(post(orderBody()), h.deps)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    expect((await handleCreateOrder(post(orderBody({ turnstile_token: 'tok' })), h.deps)).status).toBe(201)
    expect(calls).toEqual(['https://challenges.cloudflare.com/turnstile/v0/siteverify'])
    const failing = makeHarness({
      config: { turnstileSecret: 'ts-secret' },
      fetch: () => Promise.resolve(new Response(JSON.stringify({ success: false }))),
    })
    await expect(
      handleCreateOrder(post(orderBody({ turnstile_token: 'bad' })), failing.deps),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('maps coupon exhaustion raised by the database to INVALID_COUPON', async () => {
    const h = makeHarness({ state: { coupons: [coupon({ code: 'TACOS10' })] } })
    h.deps.repo = { ...h.deps.repo, createOrderTx: () => Promise.reject(new RepoError('COUPON_EXHAUSTED')) }
    await expect(
      handleCreateOrder(post(orderBody({ coupon_code: 'TACOS10' })), h.deps),
    ).rejects.toMatchObject({ code: 'INVALID_COUPON' })
    h.deps.repo = {
      ...h.deps.repo,
      createOrderTx: () => Promise.reject(new RepoError('COUPON_PHONE_EXHAUSTED')),
    }
    await expect(
      handleCreateOrder(post(orderBody({ coupon_code: 'TACOS10' })), h.deps),
    ).rejects.toMatchObject({ code: 'INVALID_COUPON', message: 'Ya usaste este cupón.' })
  })

  it('does not swallow unexpected database failures', async () => {
    const h = makeHarness()
    h.deps.repo = { ...h.deps.repo, createOrderTx: () => Promise.reject(new Error('connection reset')) }
    await expect(handleCreateOrder(post(orderBody()), h.deps)).rejects.toThrow('connection reset')
  })
})

describe('get-order — public tracking (ADR-0013)', () => {
  const token = 'a'.repeat(64)
  const stored = (over: Partial<StoredOrder> = {}): StoredOrder => ({
    id: 'o-1',
    code: 'TK-0427',
    status: 'preparing',
    type: 'delivery',
    paymentMethod: 'cash',
    paymentStatus: 'pending',
    subtotal: 16200,
    discount: 0,
    deliveryFee: 1500,
    tip: 0,
    total: 17700,
    createdAt: '2026-10-19T21:00:00.000Z',
    scheduledFor: null,
    estimatedMinutes: 40,
    tableNumber: null,
    mpPreferenceId: null,
    items: [
      {
        name: 'Tacos al pastor con piña',
        quantity: 2,
        modifiers: ['Maíz'],
        note: 'sin cebolla',
        lineTotal: 16200,
      },
    ],
    history: [{ status: 'received', at: '2026-10-19T21:00:00.000Z' }],
    ...over,
  })

  it('returns the order for the right code and token, without any personal data', async () => {
    const h = makeHarness()
    h.state.storedByToken.set(token, stored())
    const res = await handleGetOrder(post({ code: 'tk-0427', token }), h.deps)
    expect(res.status).toBe(200)
    const data = await body(res)
    expect(data).toMatchObject({
      code: 'TK-0427',
      status: 'preparing',
      total: 17700,
      store: { name: 'Takitho', whatsapp: '5491155550000' },
    })
    const text = JSON.stringify(data)
    for (const secret of ['phone', 'telefono', 'street', 'address', 'mp_payment', 'client_ip', 'customer'])
      expect(text.toLowerCase()).not.toContain(secret)
    expect(pick(data, 'transfer')).toBeUndefined()
  })

  it('answers exactly the same 404 for a wrong code and for a wrong token', async () => {
    const h = makeHarness()
    h.state.storedByToken.set(token, stored())
    const wrongCode = await handleGetOrder(post({ code: 'TK-9999', token }), h.deps).catch((e: unknown) => e)
    const wrongToken = await handleGetOrder(post({ code: 'TK-0427', token: 'b'.repeat(64) }), h.deps).catch(
      (e: unknown) => e,
    )
    expect(wrongCode).toMatchObject({ code: 'NOT_FOUND', message: 'No encontramos ese pedido.' })
    expect(wrongToken).toMatchObject({ code: 'NOT_FOUND', message: 'No encontramos ese pedido.' })
  })

  it('shows the transfer data only while a transfer is pending', async () => {
    const h = makeHarness()
    h.state.storedByToken.set(token, stored({ paymentMethod: 'transfer' }))
    expect(await body(await handleGetOrder(post({ code: 'TK-0427', token }), h.deps))).toMatchObject({
      transfer: { alias: 'takitho.tacos', cbu: '0000003100000000000001', holder: 'Takitho SRL' },
    })
    h.state.storedByToken.set(token, stored({ paymentMethod: 'transfer', paymentStatus: 'paid' }))
    expect(
      pick(await body(await handleGetOrder(post({ code: 'TK-0427', token }), h.deps)), 'transfer'),
    ).toBeUndefined()
    h.state.storedByToken.set(token, stored({ paymentMethod: 'transfer', status: 'cancelled' }))
    expect(
      pick(await body(await handleGetOrder(post({ code: 'TK-0427', token }), h.deps)), 'transfer'),
    ).toBeUndefined()
  })
})

describe('withHttp (CORS, methods, error hygiene)', () => {
  const cors = { allowedOrigins: ['https://takitho.test'] }

  it('answers preflight only for allowed origins', async () => {
    const wrapped = withHttp(cors, () => Promise.resolve(new Response('{}')))
    const ok = await wrapped(
      new Request('https://x', { method: 'OPTIONS', headers: { origin: 'https://takitho.test' } }),
    )
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://takitho.test')
    const evil = await wrapped(
      new Request('https://x', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }),
    )
    expect(evil.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects non-POST methods with the standard error body', async () => {
    const res = await withHttp(cors, () => Promise.resolve(new Response('{}')))(
      new Request('https://x', { method: 'GET' }),
    )
    expect(res.status).toBe(400)
    expect(await body(res)).toMatchObject({ error: { code: 'BAD_REQUEST' } })
  })

  it('never leaks internals: unexpected errors become a generic 500 and are logged', async () => {
    const logged: unknown[][] = []
    const res = await withHttp(
      cors,
      () => Promise.reject(new Error('password=hunter2 at db.internal:5432')),
      (...a) => logged.push(a),
    )(post({}))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('hunter2')
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'INTERNAL' } })
    expect(logged).toHaveLength(1)
  })

  it('maps domain errors to their status and sets Retry-After on 429', async () => {
    const h = makeHarness({
      config: { limits: { createIp: 1, createPhone: 3, quoteIp: 60, getOrderIp: 120, windowSeconds: 600 } },
    })
    const wrapped = withHttp(cors, (req) => handleCreateOrder(req, h.deps))
    expect((await wrapped(post(orderBody()))).status).toBe(201)
    const limited = await wrapped(post(orderBody()))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('321')
  })

  it('rejects malformed or oversized JSON bodies with 400', async () => {
    const wrapped = withHttp(cors, (req) => handleCreateOrder(req, makeHarness().deps))
    const bad = await wrapped(new Request('https://x', { method: 'POST', body: '{nope' }))
    expect(bad.status).toBe(400)
    const huge = await wrapped(
      new Request('https://x', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(70_000) }) }),
    )
    expect(huge.status).toBe(400)
  })
})
