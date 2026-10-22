// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, orderPayload, type TestDb } from './harness.ts'

let db: TestDb
let admin: string
let kitchen: string

beforeAll(async () => {
  db = await createTestDb()
  admin = await db.addStaff('admin')
  kitchen = await db.addStaff('kitchen')
}, 60_000)
afterAll(async () => {
  await db.close()
})

interface Created {
  id: string
  code: string
  public_token: string
  status: string
  payment_status: string
  total: number
  replayed: boolean
}
const service = { kind: 'service' } as const
const staff = (id: string) => ({ kind: 'staff', id }) as const

async function create(over: Record<string, unknown> = {}): Promise<Created> {
  const res = await db.as(service, (q) =>
    q<{ r: Created }>(`select public.create_order_tx($1::jsonb) as r`, [JSON.stringify(orderPayload(over))]),
  )
  const r = res.rows[0]?.r
  if (!r) throw new Error('no result')
  return r
}
const transition = (actor: ReturnType<typeof staff>, id: string, to: string, reason?: string) =>
  db.as(actor, (q) =>
    q(`select public.transition_order($1, $2::public.order_status, $3)`, [id, to, reason ?? null]),
  )
const statusOf = async (id: string) =>
  (await db.pg.query<{ status: string }>(`select status from public.orders where id = $1`, [id])).rows[0]
    ?.status

const mpOrder = (over: Record<string, unknown> = {}) =>
  create({
    initial_status: 'pending_payment',
    payment: { method: 'mercado_pago' },
    ...over,
  })

describe('create_order_tx', () => {
  it('stores the order with snapshots, history and a daily TK-code', async () => {
    const o = await create()
    expect(o).toMatchObject({
      code: 'TK-0001',
      status: 'received',
      payment_status: 'pending',
      total: 6000,
      replayed: false,
    })
    expect(o.public_token).toMatch(/^[0-9a-f]{64}$/)
    const items = await db.pg.query<{ name_snapshot: string; unit_price_snapshot: number; note: string }>(
      `select name_snapshot, unit_price_snapshot, note from public.order_items where order_id = $1`,
      [o.id],
    )
    expect(items.rows).toEqual([
      { name_snapshot: 'Tacos al pastor', unit_price_snapshot: 6000, note: 'sin cebolla' },
    ])
    const mods = await db.pg.query<{ name_snapshot: string }>(
      `select name_snapshot from public.order_item_modifiers`,
    )
    expect(mods.rows.map((m) => m.name_snapshot)).toContain('Maíz')
    const hist = await db.pg.query<{ from_status: string | null; to_status: string }>(
      `select from_status, to_status from public.order_status_history where order_id = $1`,
      [o.id],
    )
    expect(hist.rows).toEqual([{ from_status: null, to_status: 'received' }])
  })

  it('increments the code per business day and restarts on the next one', async () => {
    const second = await create()
    expect(second.code).toBe('TK-0002')
    const nextDay = await create({ business_date: '2026-10-20' })
    expect(nextDay.code).toBe('TK-0001')
  })

  it('is idempotent: the same key and payload returns the same order without consuming a code', async () => {
    const key = crypto.randomUUID()
    const first = await create({ idempotency_key: key })
    const again = await create({ idempotency_key: key })
    expect(again).toMatchObject({ id: first.id, code: first.code, replayed: true })
    const next = await create()
    expect(Number(next.code.slice(3))).toBe(Number(first.code.slice(3)) + 1)
    const count = await db.pg.query<{ n: string }>(
      `select count(*) as n from public.orders where idempotency_key = $1`,
      [key],
    )
    expect(Number(count.rows[0]?.n)).toBe(1)
  })

  it('rejects the same key with a different payload', async () => {
    const key = crypto.randomUUID()
    await create({ idempotency_key: key })
    await expect(create({ idempotency_key: key, request_hash: 'otro' })).rejects.toThrow(
      'IDEMPOTENCY_KEY_REUSED',
    )
  })

  it('refuses totals that do not add up, whatever the caller says', async () => {
    await expect(
      create({ totals: { subtotal: 6000, delivery_fee: 0, discount: 0, tip: 0, total: 100 } }),
    ).rejects.toThrow(/orders_total_matches/)
  })

  it('requires an address for delivery and a table for dine-in', async () => {
    await expect(create({ type: 'delivery' })).rejects.toThrow(/orders_delivery_has_address/)
    await expect(create({ type: 'dine_in' })).rejects.toThrow(/orders_dine_in_has_table/)
  })

  it('does not leave a half-created order when something fails mid-way', async () => {
    const before = Number(
      (await db.pg.query<{ n: string }>(`select count(*) as n from public.orders`)).rows[0]?.n,
    )
    const key = crypto.randomUUID()
    await expect(
      create({
        idempotency_key: key,
        items: [{ product_id: null, name: 'x', unit_price: 1, quantity: 99, line_total: 99 }],
      }),
    ).rejects.toThrow()
    const after = Number(
      (await db.pg.query<{ n: string }>(`select count(*) as n from public.orders`)).rows[0]?.n,
    )
    expect(after).toBe(before)
  })

  it('broadcasts the order state on a public channel keyed by the unguessable token', async () => {
    const o = await create()
    const sent = await db.pg.query<{
      topic: string
      event: string
      private: boolean
      payload: { status: string }
    }>(`select topic, event, private, payload from realtime.sent where topic = $1 order by ctid`, [
      `order:${o.public_token}`,
    ])
    expect(sent.rows[0]).toMatchObject({
      event: 'order_update',
      private: false,
      payload: { status: 'received' },
    })
    expect(JSON.stringify(sent.rows[0]?.payload)).not.toMatch(/phone|name|address/i)
  })
})

describe('coupons inside create_order_tx', () => {
  let couponId: string
  beforeAll(async () => {
    const c = await db.pg.query<{ id: string }>(
      `insert into public.coupons (code, label, kind, value, max_uses, max_uses_per_phone) values ('UNA', 'x', 'fixed', 500, 1, 1) returning id`,
    )
    couponId = c.rows[0]?.id ?? ''
  })

  const withCoupon = (over: Record<string, unknown> = {}) =>
    create({
      coupon_id: couponId,
      totals: { subtotal: 6000, delivery_fee: 0, discount: 500, tip: 0, total: 5500 },
      ...over,
    })

  it('counts the redemption atomically and refuses once exhausted', async () => {
    const o = await withCoupon()
    expect(o.total).toBe(5500)
    expect(
      (
        await db.pg.query<{ uses_count: number }>(`select uses_count from public.coupons where id = $1`, [
          couponId,
        ])
      ).rows[0]?.uses_count,
    ).toBe(1)
    await expect(withCoupon()).rejects.toThrow('COUPON_EXHAUSTED')
    expect(
      (
        await db.pg.query<{ uses_count: number }>(`select uses_count from public.coupons where id = $1`, [
          couponId,
        ])
      ).rows[0]?.uses_count,
    ).toBe(1)
  })

  it('releases the coupon when the order is cancelled', async () => {
    const o = await db.pg.query<{ id: string }>(
      `select order_id as id from public.coupon_redemptions limit 1`,
    )
    const id = o.rows[0]?.id ?? ''
    await transition(staff(admin), id, 'cancelled', 'Pidió por error')
    expect(
      (
        await db.pg.query<{ uses_count: number }>(`select uses_count from public.coupons where id = $1`, [
          couponId,
        ])
      ).rows[0]?.uses_count,
    ).toBe(0)
    const again = await withCoupon()
    expect(again.total).toBe(5500)
  })

  it('enforces the per-phone limit', async () => {
    const c = await db.pg.query<{ id: string }>(
      `insert into public.coupons (code, label, kind, value, max_uses_per_phone) values ('UNAPOR', 'x', 'fixed', 100, 1) returning id`,
    )
    const id = c.rows[0]?.id ?? ''
    const body = {
      coupon_id: id,
      totals: { subtotal: 6000, delivery_fee: 0, discount: 100, tip: 0, total: 5900 },
    }
    await create(body)
    await expect(create(body)).rejects.toThrow('COUPON_PHONE_EXHAUSTED')
    await create({ ...body, customer: { name: 'Otro', phone: '+5491100000000' } })
  })
})

describe('transition_order', () => {
  it('moves a pickup order forward one step at a time (kitchen)', async () => {
    const o = await create()
    await transition(staff(kitchen), o.id, 'preparing')
    await transition(staff(kitchen), o.id, 'ready')
    await transition(staff(kitchen), o.id, 'delivered')
    expect(await statusOf(o.id)).toBe('delivered')
    const hist = await db.pg.query<{ from_status: string; to_status: string; actor_id: string }>(
      `select from_status, to_status, actor_id from public.order_status_history where order_id = $1 and from_status is not null order by id`,
      [o.id],
    )
    expect(hist.rows.map((h) => `${h.from_status}>${h.to_status}`)).toEqual([
      'received>preparing',
      'preparing>ready',
      'ready>delivered',
    ])
    expect(hist.rows.every((h) => h.actor_id === kitchen)).toBe(true)
  })

  it('rejects skipping steps, going backwards and leaving a terminal state', async () => {
    const o = await create()
    await expect(transition(staff(kitchen), o.id, 'ready')).rejects.toThrow('INVALID_TRANSITION')
    await expect(transition(staff(kitchen), o.id, 'delivered')).rejects.toThrow('INVALID_TRANSITION')
    await transition(staff(kitchen), o.id, 'preparing')
    await expect(transition(staff(kitchen), o.id, 'received')).rejects.toThrow('INVALID_TRANSITION')
    await transition(staff(admin), o.id, 'cancelled', 'Se quedó sin gas')
    await expect(transition(staff(admin), o.id, 'preparing')).rejects.toThrow('INVALID_TRANSITION')
  })

  it('sends delivery orders through out_for_delivery and not straight to delivered', async () => {
    const o = await create({ type: 'delivery', delivery: { street: 'Av. Siempreviva', number: '742' } })
    await transition(staff(kitchen), o.id, 'preparing')
    await transition(staff(kitchen), o.id, 'ready')
    await expect(transition(staff(kitchen), o.id, 'delivered')).rejects.toThrow('INVALID_TRANSITION')
    await transition(staff(kitchen), o.id, 'out_for_delivery')
    await transition(staff(kitchen), o.id, 'delivered')
    expect(await statusOf(o.id)).toBe('delivered')
  })

  it('only admins cancel, and always with a reason', async () => {
    const o = await create()
    await expect(transition(staff(kitchen), o.id, 'cancelled', 'x')).rejects.toThrow('FORBIDDEN')
    await expect(transition(staff(admin), o.id, 'cancelled')).rejects.toThrow('REASON_REQUIRED')
    await expect(transition(staff(admin), o.id, 'cancelled', '   ')).rejects.toThrow('REASON_REQUIRED')
    await transition(staff(admin), o.id, 'cancelled', 'Cliente no contesta')
    expect(
      (
        await db.pg.query<{ cancel_reason: string }>(
          `select cancel_reason from public.orders where id = $1`,
          [o.id],
        )
      ).rows[0]?.cancel_reason,
    ).toBe('Cliente no contesta')
  })

  it('never lets anyone UPDATE orders.status directly, not even the service role', async () => {
    const o = await create()
    await expect(
      db.as(service, (q) => q(`update public.orders set status = 'delivered' where id = $1`, [o.id])),
    ).rejects.toThrow('STATUS_CHANGE_FORBIDDEN')
    await expect(
      db.pg.query(`update public.orders set status = 'delivered' where id = $1`, [o.id]),
    ).rejects.toThrow('STATUS_CHANGE_FORBIDDEN')
    expect(await statusOf(o.id)).toBe('received')
  })

  it('does not let staff approve an unpaid Mercado Pago order', async () => {
    const o = await mpOrder()
    await expect(transition(staff(admin), o.id, 'received')).rejects.toThrow('PAYMENT_REQUIRED')
  })

  it('reports unknown orders', async () => {
    await expect(transition(staff(admin), crypto.randomUUID(), 'preparing')).rejects.toThrow(
      'ORDER_NOT_FOUND',
    )
  })
})

describe('mark_order_paid', () => {
  it('lets an admin collect cash and transfer, once', async () => {
    const o = await create()
    await db.as(staff(admin), (q) => q(`select public.mark_order_paid($1)`, [o.id]))
    const r = await db.pg.query<{ payment_status: string; paid_at: string | null }>(
      `select payment_status, paid_at from public.orders where id = $1`,
      [o.id],
    )
    expect(r.rows[0]?.payment_status).toBe('paid')
    expect(r.rows[0]?.paid_at).not.toBeNull()
    await expect(db.as(staff(admin), (q) => q(`select public.mark_order_paid($1)`, [o.id]))).rejects.toThrow(
      'NOT_MANUAL_PAYMENT',
    )
  })

  it('refuses Mercado Pago orders (only the webhook can approve those)', async () => {
    const o = await mpOrder()
    await expect(db.as(staff(admin), (q) => q(`select public.mark_order_paid($1)`, [o.id]))).rejects.toThrow(
      'NOT_MANUAL_PAYMENT',
    )
  })
})

describe('check_rate_limit', () => {
  const hit = async (key: string, max: number) =>
    (
      await db.as(service, (q) =>
        q<{ r: { allowed: boolean; count: number; retry_after_s: number } }>(
          `select public.check_rate_limit($1, $2, 600) as r`,
          [key, max],
        ),
      )
    ).rows[0]?.r

  it('allows up to max and then blocks with a retry hint', async () => {
    const results = [await hit('ip:a', 3), await hit('ip:a', 3), await hit('ip:a', 3), await hit('ip:a', 3)]
    expect(results.map((r) => r?.allowed)).toEqual([true, true, true, false])
    expect(results[3]?.retry_after_s).toBeGreaterThan(0)
    expect(results[3]?.retry_after_s).toBeLessThanOrEqual(600)
  })

  it('counts each key separately', async () => {
    expect((await hit('phone:b', 1))?.allowed).toBe(true)
    expect((await hit('phone:c', 1))?.allowed).toBe(true)
    expect((await hit('phone:b', 1))?.allowed).toBe(false)
  })
})

describe('apply_payment_result (Mercado Pago webhook)', () => {
  const apply = async (orderId: string, paymentId: string, status: string, amount = 6000, currency = 'ARS') =>
    (
      await db.as(service, (q) =>
        q<{ r: { result: string } }>(
          `select public.apply_payment_result($1, $2, $3, $4, $5, '{}'::jsonb) as r`,
          [orderId, paymentId, status, amount, currency],
        ),
      )
    ).rows[0]?.r.result
  const alerts = async (orderId: string) =>
    (
      await db.pg.query<{ kind: string }>(`select kind from public.admin_alerts where order_id = $1`, [
        orderId,
      ])
    ).rows.map((r) => r.kind)

  it('approves a payment: marks it paid and releases the order to the kitchen', async () => {
    const o = await mpOrder()
    expect(await apply(o.id, 'pay-1', 'approved')).toBe('paid')
    const r = await db.pg.query<{ status: string; payment_status: string; mp_payment_id: string }>(
      `select status, payment_status, mp_payment_id from public.orders where id = $1`,
      [o.id],
    )
    expect(r.rows[0]).toEqual({ status: 'received', payment_status: 'paid', mp_payment_id: 'pay-1' })
  })

  it('is idempotent: the same notification twice changes nothing', async () => {
    const o = await mpOrder()
    expect(await apply(o.id, 'pay-2', 'approved')).toBe('paid')
    await transition(staff(kitchen), o.id, 'preparing')
    expect(await apply(o.id, 'pay-2', 'approved')).toBe('duplicate')
    expect(await statusOf(o.id)).toBe('preparing')
  })

  it('refuses to approve when the amount or currency differ, and raises an alert', async () => {
    const o = await mpOrder()
    expect(await apply(o.id, 'pay-3', 'approved', 5999)).toBe('amount_mismatch')
    expect(await apply(o.id, 'pay-4', 'approved', 6000, 'USD')).toBe('amount_mismatch')
    const r = await db.pg.query<{ status: string; payment_status: string }>(
      `select status, payment_status from public.orders where id = $1`,
      [o.id],
    )
    expect(r.rows[0]).toEqual({ status: 'pending_payment', payment_status: 'pending' })
    expect(await alerts(o.id)).toEqual(['amount_mismatch', 'amount_mismatch'])
  })

  it('marks a rejected payment as failed but keeps the order retryable', async () => {
    const o = await mpOrder()
    expect(await apply(o.id, 'pay-5', 'rejected')).toBe('failed')
    const r = await db.pg.query<{ status: string; payment_status: string }>(
      `select status, payment_status from public.orders where id = $1`,
      [o.id],
    )
    expect(r.rows[0]).toEqual({ status: 'pending_payment', payment_status: 'failed' })
    expect(await apply(o.id, 'pay-6', 'approved')).toBe('paid')
    expect(await statusOf(o.id)).toBe('received')
  })

  it('never downgrades a paid order when a late "rejected" from another attempt arrives', async () => {
    const o = await mpOrder()
    await apply(o.id, 'pay-7', 'approved')
    await apply(o.id, 'pay-8', 'rejected')
    expect(
      (
        await db.pg.query<{ payment_status: string }>(
          `select payment_status from public.orders where id = $1`,
          [o.id],
        )
      ).rows[0]?.payment_status,
    ).toBe('paid')
  })

  it('alerts the admin when an approved payment arrives for an already cancelled order', async () => {
    const o = await mpOrder()
    await transition(staff(admin), o.id, 'cancelled', 'Expiró')
    expect(await apply(o.id, 'pay-9', 'approved')).toBe('paid')
    expect(await statusOf(o.id)).toBe('cancelled')
    expect(await alerts(o.id)).toEqual(['late_payment'])
  })

  it('records refunds and ignores in-flight states', async () => {
    const o = await mpOrder()
    await apply(o.id, 'pay-10', 'approved')
    expect(await apply(o.id, 'pay-10', 'in_process')).toBe('ignored')
    expect(await apply(o.id, 'pay-10', 'refunded')).toBe('refunded')
    expect(
      (
        await db.pg.query<{ payment_status: string }>(
          `select payment_status from public.orders where id = $1`,
          [o.id],
        )
      ).rows[0]?.payment_status,
    ).toBe('refunded')
    expect(await alerts(o.id)).toContain('refund')
  })

  it('flags payments that match no order', async () => {
    const result = await apply(crypto.randomUUID(), 'pay-11', 'approved')
    expect(result).toBe('unknown_order')
  })
})

describe('expire_pending_payments', () => {
  it('cancels unpaid Mercado Pago orders older than the TTL and keeps the recent ones', async () => {
    const old = await mpOrder()
    const fresh = await mpOrder()
    await db.pg.query(`update public.orders set created_at = now() - interval '45 minutes' where id = $1`, [
      old.id,
    ])
    const n = await db.as(service, (q) => q<{ n: number }>(`select public.expire_pending_payments() as n`))
    expect(n.rows[0]?.n).toBe(1)
    expect(await statusOf(old.id)).toBe('cancelled')
    expect(await statusOf(fresh.id)).toBe('pending_payment')
    expect(
      (
        await db.pg.query<{ cancel_reason: string }>(
          `select cancel_reason from public.orders where id = $1`,
          [old.id],
        )
      ).rows[0]?.cancel_reason,
    ).toBe('Pago no completado')
  })

  it('is not callable by customers or staff', async () => {
    await expect(
      db.as({ kind: 'anon' }, (q) => q(`select public.expire_pending_payments()`)),
    ).rejects.toThrow(/permission denied/)
    await expect(db.as(staff(admin), (q) => q(`select public.expire_pending_payments()`))).rejects.toThrow(
      /permission denied/,
    )
  })
})
