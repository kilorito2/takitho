// @vitest-environment node
// Contract test: the payload built by the TypeScript pipeline must be accepted by the real SQL function.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleCreateOrder } from '../../supabase/functions/_shared/handlers/orders.ts'
import { ID, coupon, makeHarness, orderBody, post, zone } from '../functions/testkit.ts'
import { createTestDb, type TestDb } from './harness.ts'

let db: TestDb
const COUPON = '88888888-8888-4888-8888-888888888888'

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.query(`insert into public.categories (id, name, slug) values ($1, 'Tacos', 'tacos')`, [
    ID.catTacos,
  ])
  await db.pg.query(
    `insert into public.products (id, category_id, name, slug, price) values ($1, $2, 'Tacos al pastor con piña', 'al-pastor', 7200)`,
    [ID.pastor, ID.catTacos],
  )
  await db.pg.query(
    `insert into public.modifier_groups (id, name) values ('99999999-0000-4000-8000-000000000001', 'Tortilla')`,
  )
  await db.pg.query(
    `insert into public.modifiers (id, group_id, name) values ($1, '99999999-0000-4000-8000-000000000001', 'Maíz'), ($2, '99999999-0000-4000-8000-000000000001', 'Queso extra')`,
    [ID.maiz, ID.queso],
  )
  await db.pg.query(
    `insert into public.delivery_zones (id, name, fee, min_order) values ($1, 'Zona 1', $2, $3)`,
    [ID.zone, zone.fee, zone.minOrder],
  )
  await db.pg.query(`insert into public.tables (id, number) values ($1, 3)`, [ID.table])
  await db.pg.query(
    `insert into public.coupons (id, code, label, kind, value) values ($1, 'TACOS10', '10 %', 'percent', 10)`,
    [COUPON],
  )
}, 60_000)
afterAll(async () => {
  await db.close()
})

/** Runs the real handler, then replays the exact payload it produced through the SQL function. */
async function viaPipeline(over: Record<string, unknown>, couponId: string | null = null) {
  const h = makeHarness({ state: { coupons: couponId ? [coupon({ id: couponId })] : [] } })
  const res = await handleCreateOrder(post(orderBody(over)), h.deps)
  expect(res.status).toBe(201)
  const payload = h.state.orders[0]?.payload
  if (!payload) throw new Error('pipeline produced no payload')
  const sql = await db.as({ kind: 'service' }, (q) =>
    q<{ r: { id: string; code: string; total: number; status: string } }>(
      `select public.create_order_tx($1::jsonb) as r`,
      [JSON.stringify(payload)],
    ),
  )
  const created = sql.rows[0]?.r
  if (!created) throw new Error('no SQL result')
  return { payload, created }
}

describe('TypeScript pipeline ⇄ SQL create_order_tx', () => {
  it('stores a pickup/cash order exactly as the pipeline computed it', async () => {
    const { payload, created } = await viaPipeline({})
    expect(created).toMatchObject({ total: payload.totals.total, status: 'received' })
    const row = await db.pg.query<{
      subtotal: number
      total: number
      customer_phone: string
      payment_method: string
      cash_paid_with: number
      estimated_minutes: number
    }>(
      `select subtotal, total, customer_phone, payment_method, cash_paid_with, estimated_minutes from public.orders where id = $1`,
      [created.id],
    )
    expect(row.rows[0]).toEqual({
      subtotal: 16200,
      total: 16200,
      customer_phone: '+5491112345678',
      payment_method: 'cash',
      cash_paid_with: 20000,
      estimated_minutes: 25,
    })
    const mods = await db.pg.query<{ name_snapshot: string; modifier_id: string }>(
      `select m.name_snapshot, m.modifier_id from public.order_item_modifiers m join public.order_items i on i.id = m.order_item_id where i.order_id = $1 order by m.name_snapshot`,
      [created.id],
    )
    expect(mods.rows.map((m) => m.name_snapshot)).toEqual(['Maíz', 'Queso extra'])
    expect(mods.rows.every((m) => typeof m.modifier_id === 'string')).toBe(true)
  })

  it('stores a delivery order with address, zone and a coupon redemption', async () => {
    const { created } = await viaPipeline(
      {
        type: 'delivery',
        delivery: {
          zone_id: ID.zone,
          street: 'Av. Siempreviva',
          number: '742',
          floor_apt: '3B',
          references: 'portón verde',
        },
        coupon_code: 'TACOS10',
        payment: { method: 'transfer' },
      },
      COUPON,
    )
    const row = await db.pg.query<{
      delivery_street: string
      delivery_floor_apt: string
      delivery_references: string
      zone_id: string
      discount: number
      delivery_fee: number
      total: number
    }>(
      `select delivery_street, delivery_floor_apt, delivery_references, zone_id, discount, delivery_fee, total from public.orders where id = $1`,
      [created.id],
    )
    // 2 × 8.100 = 16.200; 10 % = 1.620; + envío 1.500 = 16.080
    expect(row.rows[0]).toEqual({
      delivery_street: 'Av. Siempreviva',
      delivery_floor_apt: '3B',
      delivery_references: 'portón verde',
      zone_id: ID.zone,
      discount: 1620,
      delivery_fee: 1500,
      total: 16080,
    })
    const red = await db.pg.query<{ discount: number }>(
      `select discount from public.coupon_redemptions where order_id = $1`,
      [created.id],
    )
    expect(red.rows[0]?.discount).toBe(1620)
  })

  it('stores a dine-in order for the table of the QR and a Mercado Pago order as pending_payment', async () => {
    const dine = await viaPipeline({ type: 'dine_in', table_number: 3 })
    expect(
      (
        await db.pg.query<{ table_id: string }>(`select table_id from public.orders where id = $1`, [
          dine.created.id,
        ])
      ).rows[0]?.table_id,
    ).toBe(ID.table)
    const mp = await viaPipeline({ payment: { method: 'mercado_pago' } })
    expect(mp.created.status).toBe('pending_payment')
  })

  it('keeps the SQL idempotency verdict consistent with the TypeScript one', async () => {
    const { payload } = await viaPipeline({})
    const replay = await db.as({ kind: 'service' }, (q) =>
      q<{ r: { replayed: boolean } }>(`select public.create_order_tx($1::jsonb) as r`, [
        JSON.stringify(payload),
      ]),
    )
    expect(replay.rows[0]?.r.replayed).toBe(true)
    await expect(
      db.as({ kind: 'service' }, (q) =>
        q(`select public.create_order_tx($1::jsonb)`, [JSON.stringify({ ...payload, request_hash: 'otro' })]),
      ),
    ).rejects.toThrow('IDEMPOTENCY_KEY_REUSED')
  })
})
