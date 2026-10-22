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

const service = { kind: 'service' } as const
const staff = (id: string) => ({ kind: 'staff', id }) as const

async function create(over: Record<string, unknown> = {}): Promise<{ id: string }> {
  const res = await db.as(service, (q) =>
    q<{ r: { id: string } }>(`select public.create_order_tx($1::jsonb) as r`, [
      JSON.stringify(orderPayload(over)),
    ]),
  )
  const r = res.rows[0]?.r
  if (!r) throw new Error('no result')
  return r
}

const item = (name: string, quantity: number, unit: number) => ({
  product_id: null,
  name,
  unit_price: unit,
  quantity,
  line_total: unit * quantity,
  note: null,
  modifiers: [],
})
const totals = (subtotal: number, extra: { tip?: number; delivery_fee?: number } = {}) => ({
  subtotal,
  delivery_fee: extra.delivery_fee ?? 0,
  discount: 0,
  tip: extra.tip ?? 0,
  total: subtotal + (extra.delivery_fee ?? 0) + (extra.tip ?? 0),
})

interface Dashboard {
  totals: {
    orders: number
    sales: number
    avg_ticket: number
    tips: number
    delivery_fees: number
    discounts: number
  }
  by_day: { date: string; orders: number; sales: number }[]
  top_products: { name: string; quantity: number; revenue: number }[]
  by_hour: { hour: number; orders: number }[]
  payment_mix: { method: string; orders: number; sales: number }[]
  by_type: { type: string; orders: number; sales: number }[]
}

const dashboard = async (actor: ReturnType<typeof staff>, from: string, to: string) =>
  (
    await db.as(actor, (q) =>
      q<{ r: Dashboard }>(`select public.admin_dashboard($1::date, $2::date) as r`, [from, to]),
    )
  ).rows[0]!.r

describe('admin_dashboard', () => {
  beforeAll(async () => {
    // Monday 19th: two cash orders (one with tip) + a delivery paid online. Tuesday 20th: one transfer.
    await create({
      business_date: '2026-10-19',
      items: [item('Tacos al pastor', 2, 6000)],
      totals: totals(12000, { tip: 600 }),
    })
    await create({
      business_date: '2026-10-19',
      items: [item('Tacos al pastor', 1, 6000), item('Esquites', 1, 4000)],
      totals: totals(10000),
    })
    await create({
      business_date: '2026-10-19',
      type: 'delivery',
      delivery: { street: 'Av. Siempreviva', number: '742' },
      payment: { method: 'mercado_pago' },
      items: [item('Quesabirria', 1, 9000)],
      totals: totals(9000, { delivery_fee: 1500 }),
    })
    await create({
      business_date: '2026-10-20',
      payment: { method: 'transfer' },
      items: [item('Flan', 3, 3000)],
      totals: totals(9000),
    })
    // Not sales: still waiting for the online payment, and cancelled.
    await create({
      business_date: '2026-10-19',
      initial_status: 'pending_payment',
      payment: { method: 'mercado_pago' },
      items: [item('Burrito', 1, 8000)],
      totals: totals(8000),
    })
    const cancelled = await create({
      business_date: '2026-10-19',
      items: [item('Burrito', 1, 8000)],
      totals: totals(8000),
    })
    await db.as(staff(admin), (q) =>
      q(`select public.transition_order($1, 'cancelled'::public.order_status, 'prueba')`, [cancelled.id]),
    )
  })

  it('adds up sales, average ticket, tips and delivery fees over the range, ignoring unpaid and cancelled orders', async () => {
    const d = await dashboard(staff(admin), '2026-10-19', '2026-10-20')
    expect(d.totals).toEqual({
      orders: 4,
      sales: 12600 + 10000 + 10500 + 9000,
      avg_ticket: 10525,
      tips: 600,
      delivery_fees: 1500,
      discounts: 0,
    })
  })

  it('has one row per day of the range, empty days included', async () => {
    const d = await dashboard(staff(admin), '2026-10-18', '2026-10-20')
    expect(d.by_day.map((r) => [r.date, r.orders, r.sales])).toEqual([
      ['2026-10-18', 0, 0],
      ['2026-10-19', 3, 33100],
      ['2026-10-20', 1, 9000],
    ])
  })

  it('ranks products by units sold, then by revenue', async () => {
    const d = await dashboard(staff(admin), '2026-10-19', '2026-10-20')
    expect(d.top_products.slice(0, 3)).toEqual([
      // Same units: the one that brought in more money goes first.
      { name: 'Tacos al pastor', quantity: 3, revenue: 18000 },
      { name: 'Flan', quantity: 3, revenue: 9000 },
      { name: 'Quesabirria', quantity: 1, revenue: 9000 },
    ])
  })

  it('splits sales by payment method and by order type', async () => {
    const d = await dashboard(staff(admin), '2026-10-19', '2026-10-20')
    expect(d.payment_mix).toEqual([
      { method: 'cash', orders: 2, sales: 22600 },
      { method: 'mercado_pago', orders: 1, sales: 10500 },
      { method: 'transfer', orders: 1, sales: 9000 },
    ])
    expect(d.by_type).toEqual([
      { type: 'pickup', orders: 3, sales: 31600 },
      { type: 'delivery', orders: 1, sales: 10500 },
    ])
  })

  it('reports the 24 local hours of the day', async () => {
    const d = await dashboard(staff(admin), '2026-10-19', '2026-10-20')
    expect(d.by_hour).toHaveLength(24)
    expect(d.by_hour.reduce((n, h) => n + h.orders, 0)).toBe(4)
  })

  it('is an empty report, not an error, when nothing was sold', async () => {
    const d = await dashboard(staff(admin), '2026-01-01', '2026-01-02')
    expect(d.totals).toMatchObject({ orders: 0, sales: 0, avg_ticket: 0 })
    expect(d.top_products).toEqual([])
  })

  it('refuses everyone but admins, and nonsense ranges', async () => {
    await expect(dashboard(staff(kitchen), '2026-10-19', '2026-10-20')).rejects.toThrow(/FORBIDDEN/)
    await expect(
      db.as({ kind: 'anon' }, (q) => q(`select public.admin_dashboard('2026-10-19', '2026-10-20')`)),
    ).rejects.toThrow(/permission denied/)
    await expect(dashboard(staff(admin), '2026-10-20', '2026-10-19')).rejects.toThrow(/INVALID_RANGE/)
    await expect(dashboard(staff(admin), '2020-01-01', '2026-10-19')).rejects.toThrow(/INVALID_RANGE/)
  })
})

describe('last admin guard', () => {
  it('lets the only admin neither demote, deactivate nor delete themselves', async () => {
    await expect(
      db.as(staff(admin), (q) => q(`update public.profiles set role = 'kitchen' where id = $1`, [admin])),
    ).rejects.toThrow(/LAST_ADMIN/)
    await expect(
      db.as(staff(admin), (q) => q(`update public.profiles set is_active = false where id = $1`, [admin])),
    ).rejects.toThrow(/LAST_ADMIN/)
    await expect(
      db.as(staff(admin), (q) => q(`delete from public.profiles where id = $1`, [admin])),
    ).rejects.toThrow(/LAST_ADMIN/)
  })

  it('allows it once another active admin exists, and still allows editing other profiles', async () => {
    const second = await db.addStaff('admin', 'segundo')
    await db.as(staff(admin), (q) =>
      q(`update public.profiles set full_name = 'Dueña' where id = $1`, [admin]),
    )
    await db.as(staff(second), (q) =>
      q(`update public.profiles set is_active = false where id = $1`, [admin]),
    )
    // `second` is now the last one standing.
    await expect(
      db.as(staff(second), (q) => q(`update public.profiles set role = 'kitchen' where id = $1`, [second])),
    ).rejects.toThrow(/LAST_ADMIN/)
    await db.as(staff(second), (q) =>
      q(`update public.profiles set full_name = 'Cocina', role = 'kitchen' where id = $1`, [kitchen]),
    )
    await db.pg.query(`update public.profiles set is_active = true where id = $1`, [admin])
  })
})

describe('replace_opening_hours', () => {
  const replace = (actor: ReturnType<typeof staff>, shifts: unknown) =>
    db.as(actor, (q) => q(`select public.replace_opening_hours($1::jsonb)`, [JSON.stringify(shifts)]))
  const hours = async () =>
    (
      await db.pg.query<{ weekday: number; opens_at: string; closes_at: string }>(
        `select weekday, opens_at::text, closes_at::text from public.opening_hours order by weekday, opens_at`,
      )
    ).rows

  it('swaps the whole week in one go', async () => {
    await replace(staff(admin), [
      { weekday: 5, opens_at: '19:00', closes_at: '02:00' },
      { weekday: 2, opens_at: '12:00', closes_at: '15:00' },
      { weekday: 2, opens_at: '19:00', closes_at: '23:30' },
    ])
    expect(await hours()).toEqual([
      { weekday: 2, opens_at: '12:00:00', closes_at: '15:00:00' },
      { weekday: 2, opens_at: '19:00:00', closes_at: '23:30:00' },
      { weekday: 5, opens_at: '19:00:00', closes_at: '02:00:00' },
    ])
  })

  it('leaves the old hours untouched when the new ones are invalid (all or nothing)', async () => {
    await expect(
      replace(staff(admin), [
        { weekday: 1, opens_at: '19:00', closes_at: '23:00' },
        { weekday: 9, opens_at: '19:00', closes_at: '23:00' },
      ]),
    ).rejects.toThrow()
    expect(await hours()).toHaveLength(3)
  })

  it('is for admins only', async () => {
    await expect(replace(staff(kitchen), [])).rejects.toThrow(/FORBIDDEN/)
    await expect(
      db.as({ kind: 'anon' }, (q) => q(`select public.replace_opening_hours('[]')`)),
    ).rejects.toThrow(/permission denied/)
    await expect(replace(staff(admin), { weekday: 1 })).rejects.toThrow(/INVALID_SHIFTS/)
  })
})
