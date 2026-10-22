// @vitest-environment node
// Every policy/grant has at least one positive and one negative test (CONSTRAINTS.md §3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, orderPayload, type TestDb } from './harness.ts'

let db: TestDb
let admin: string
let kitchen: string
let orderId: string
let productId: string

beforeAll(async () => {
  db = await createTestDb()
  admin = await db.addStaff('admin')
  kitchen = await db.addStaff('kitchen')
  const cat = await db.pg.query<{ id: string }>(
    `insert into public.categories (name, slug) values ('Tacos', 'tacos') returning id`,
  )
  const p = await db.pg.query<{ id: string }>(
    `insert into public.products (category_id, name, slug, price) values ($1, 'Tacos al pastor', 'al-pastor', 6000) returning id`,
    [cat.rows[0]?.id],
  )
  productId = p.rows[0]?.id ?? ''
  await db.pg.query(
    `insert into public.products (name, slug, price, is_active) values ('Oculto', 'oculto', 100, false)`,
  )
  await db.pg.query(
    `insert into public.coupons (code, label, kind, value) values ('SECRETO', 'x', 'percent', 10)`,
  )
  const r = await db.as({ kind: 'service' }, (q) =>
    q<{ r: { id: string } }>(`select public.create_order_tx($1::jsonb) as r`, [
      JSON.stringify(orderPayload()),
    ]),
  )
  orderId = r.rows[0]?.r.id ?? ''
}, 60_000)
afterAll(async () => {
  await db.close()
})

const anon = { kind: 'anon' } as const

describe('anon (customers)', () => {
  it('reads only the active menu', async () => {
    const rows = await db.as(anon, (q) =>
      q<{ slug: string }>(`select slug from public.products order by slug`),
    )
    expect(rows.rows.map((r) => r.slug)).toEqual(['al-pastor'])
  })

  it('reads the public store settings but not the transfer data or kitchen timers', async () => {
    const ok = await db.as(anon, (q) =>
      q<{ name: string }>(`select name, whatsapp, tip_presets from public.store_settings`),
    )
    expect(ok.rows[0]?.name).toBe('Takitho')
    await expect(db.as(anon, (q) => q(`select transfer_alias from public.store_settings`))).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      db.as(anon, (q) => q(`select timer_warn_minutes from public.store_settings`)),
    ).rejects.toThrow(/permission denied/)
  })

  it.each([
    'coupons',
    'orders',
    'order_items',
    'profiles',
    'rate_limits',
    'payment_events',
    'tables',
    'admin_alerts',
  ])('cannot read %s', async (table) => {
    await expect(db.as(anon, (q) => q(`select * from public.${table}`))).rejects.toThrow(/permission denied/)
  })

  it('cannot insert, update or delete orders directly (A4/§10: only the Edge Function writes)', async () => {
    await expect(
      db.as(anon, (q) =>
        q(`insert into public.orders (idempotency_key, request_hash, business_date, type, customer_name, customer_phone, subtotal, total, payment_method)
           values (gen_random_uuid(), 'h', current_date, 'pickup', 'x', 'y', 1, 1, 'cash')`),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(db.as(anon, (q) => q(`update public.orders set total = 1`))).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.as(anon, (q) => q(`delete from public.orders`))).rejects.toThrow(/permission denied/)
  })

  it('cannot change the menu', async () => {
    await expect(db.as(anon, (q) => q(`update public.products set price = 1`))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('cannot call server or staff functions', async () => {
    await expect(db.as(anon, (q) => q(`select public.create_order_tx('{}'::jsonb)`))).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.as(anon, (q) => q(`select public.check_rate_limit('k', 1, 60)`))).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.as(anon, (q) => q(`select public.set_store_paused(true)`))).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      db.as(anon, (q) => q(`select public.transition_order($1, 'preparing')`, [orderId])),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('anon and promos', () => {
  it('sees automatic promos only, and only the public columns', async () => {
    await db.pg.query(
      `insert into public.coupons (code, label, kind, value, auto_apply) values (null, 'Martes 2x1', 'two_for_one', 0, true)`,
    )
    const rows = await db.as(anon, (q) => q<{ label: string }>(`select label from public.coupons`))
    expect(rows.rows.map((r) => r.label)).toEqual(['Martes 2x1'])
    await expect(db.as(anon, (q) => q(`select code from public.coupons`))).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      db.as(anon, (q) => q(`select uses_count, max_uses_per_phone from public.coupons`)),
    ).rejects.toThrow(/permission denied/)
    await expect(db.as(anon, (q) => q(`update public.coupons set value = 99`))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('cannot see inactive promos or promos that need a code', async () => {
    await db.pg.query(
      `insert into public.coupons (code, label, kind, value, auto_apply, is_active) values (null, 'Vieja', 'percent', 5, true, false)`,
    )
    const labels = (
      await db.as(anon, (q) => q<{ label: string }>(`select label from public.coupons order by label`))
    ).rows.map((r) => r.label)
    expect(labels).toEqual(['Martes 2x1'])
    expect(labels).not.toContain('x') // the coded SECRETO coupon from the fixture stays hidden
  })
})

describe('kitchen', () => {
  const k = () => ({ kind: 'staff', id: kitchen }) as const

  it('reads orders and the full menu, including hidden products', async () => {
    const orders = await db.as(k(), (q) => q(`select id from public.orders`))
    expect(orders.rows).toHaveLength(1)
    const products = await db.as(k(), (q) => q(`select id from public.products`))
    expect(products.rows).toHaveLength(2)
  })

  it('cannot edit the menu directly (RLS filters the update to zero rows)', async () => {
    const res = await db.as(k(), (q) => q(`update public.products set price = 1 returning id`))
    expect(res.rows).toHaveLength(0)
    const price = await db.pg.query<{ price: number }>(`select price from public.products where id = $1`, [
      productId,
    ])
    expect(price.rows[0]?.price).toBe(6000)
  })

  it('cannot read coupons or payment events, nor insert into orders', async () => {
    expect((await db.as(k(), (q) => q(`select * from public.coupons`))).rows).toHaveLength(0)
    expect((await db.as(k(), (q) => q(`select * from public.payment_events`))).rows).toHaveLength(0)
    await expect(db.as(k(), (q) => q(`update public.orders set total = 1`))).rejects.toThrow(
      /permission denied/,
    )
  })

  it('can use the quick buttons: sold out and pause', async () => {
    await db.as(k(), (q) => q(`select public.set_product_available($1, false)`, [productId]))
    const r = await db.pg.query<{ is_available: boolean }>(
      `select is_available from public.products where id = $1`,
      [productId],
    )
    expect(r.rows[0]?.is_available).toBe(false)
    await db.as(k(), (q) => q(`select public.set_product_available($1, true)`, [productId]))
    await db.as(k(), (q) => q(`select public.set_store_paused(true)`))
    expect(
      (await db.pg.query<{ is_paused: boolean }>(`select is_paused from public.store_settings`)).rows[0]
        ?.is_paused,
    ).toBe(true)
    await db.as(k(), (q) => q(`select public.set_store_paused(false)`))
  })

  it('cannot mark payments, cancel, or read profiles of others', async () => {
    await expect(db.as(k(), (q) => q(`select public.mark_order_paid($1)`, [orderId]))).rejects.toThrow(
      'FORBIDDEN',
    )
    await expect(
      db.as(k(), (q) => q(`select public.transition_order($1, 'cancelled', 'x')`, [orderId])),
    ).rejects.toThrow('FORBIDDEN')
    const profiles = await db.as(k(), (q) => q<{ id: string }>(`select id from public.profiles`))
    expect(profiles.rows.map((r) => r.id)).toEqual([kitchen])
  })
})

describe('admin', () => {
  const a = () => ({ kind: 'staff', id: admin }) as const

  it('edits the menu and reads coupons', async () => {
    const res = await db.as(a(), (q) =>
      q(`update public.products set price = 6500 where id = $1 returning price`, [productId]),
    )
    expect(res.rows).toHaveLength(1)
    const codes = (
      await db.as(a(), (q) => q<{ code: string | null }>(`select code from public.coupons`))
    ).rows.map((r) => r.code)
    expect(codes).toContain('SECRETO')
    await db.pg.query(`update public.products set price = 6000 where id = $1`, [productId])
  })

  it('still cannot write orders directly, only through the functions', async () => {
    await expect(db.as(a(), (q) => q(`update public.orders set total = 1`))).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('signed-in users without a staff profile', () => {
  it('get nothing', async () => {
    const stranger =
      (await db.pg.query<{ id: string }>(`insert into auth.users (email) values ('x@y.test') returning id`))
        .rows[0]?.id ?? ''
    const s = { kind: 'staff', id: stranger } as const
    expect((await db.as(s, (q) => q(`select * from public.orders`))).rows).toHaveLength(0)
    expect((await db.as(s, (q) => q(`select * from public.coupons`))).rows).toHaveLength(0)
    await expect(db.as(s, (q) => q(`select public.set_store_paused(true)`))).rejects.toThrow('FORBIDDEN')
  })

  it('lose access when the profile is deactivated', async () => {
    const id = await db.addStaff('kitchen', 'inactiva')
    await db.pg.query(`update public.profiles set is_active = false where id = $1`, [id])
    expect((await db.as({ kind: 'staff', id }, (q) => q(`select * from public.orders`))).rows).toHaveLength(0)
  })
})
