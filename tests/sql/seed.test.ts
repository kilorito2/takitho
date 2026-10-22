// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from './harness.ts'

let db: TestDb
const SEED = readFileSync(path.resolve(import.meta.dirname, '../../supabase/seed.sql'), 'utf8')

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.exec(SEED)
}, 60_000)
afterAll(async () => {
  await db.close()
})

const count = async (sql: string) => Number((await db.pg.query<{ n: string }>(sql)).rows[0]?.n)

describe('seed.sql', () => {
  it('loads the full menu from the brief', async () => {
    expect(await count(`select count(*) as n from public.categories`)).toBe(6)
    expect(await count(`select count(*) as n from public.products`)).toBe(25)
    expect(await count(`select count(*) as n from public.products where type = 'combo'`)).toBe(2)
  })

  it('gives every product a Cloudinary photo under takitho/menu', async () => {
    expect(
      await count(
        `select count(*) as n from public.products where image_public_id is null or image_public_id not like 'takitho/menu/%'`,
      ),
    ).toBe(0)
  })

  it('has the modifier groups of the brief with their rules', async () => {
    const g = await db.pg.query<{
      name: string
      min_select: number
      max_select: number
      is_required: boolean
    }>(
      `select name, min_select, max_select, is_required from public.modifier_groups where name in ('Tortilla', 'Salsas', '¿Con todo?', 'Extras') order by name`,
    )
    expect(g.rows).toEqual([
      { name: 'Extras', min_select: 0, max_select: 3, is_required: false },
      { name: 'Salsas', min_select: 0, max_select: 2, is_required: false },
      { name: 'Tortilla', min_select: 1, max_select: 1, is_required: true },
      { name: '¿Con todo?', min_select: 1, max_select: 1, is_required: true },
    ])
    const extras = await db.pg.query<{ name: string; price_delta: number }>(
      `select m.name, m.price_delta from public.modifiers m join public.modifier_groups g on g.id = m.group_id where g.name = 'Extras' order by m.sort`,
    )
    expect(extras.rows.map((r) => r.name)).toEqual(['Queso extra', 'Guacamole', 'Doble proteína'])
    expect(extras.rows.every((r) => r.price_delta > 0)).toBe(true)
  })

  it('marks the veggie tacos and keeps prices as whole pesos', async () => {
    expect(
      await count(`select count(*) as n from public.products where 'veggie' = any(tags)`),
    ).toBeGreaterThanOrEqual(8)
    expect(await count(`select count(*) as n from public.products where price <= 0`)).toBe(0)
  })

  it('leaves the real business data as [COMPLETAR]', async () => {
    const s = await db.pg.query<Record<string, string>>(
      `select address, whatsapp, instagram, transfer_alias, transfer_cbu from public.store_settings`,
    )
    expect(Object.values(s.rows[0] ?? {}).every((v) => v === '[COMPLETAR]')).toBe(true)
    expect(
      await count(`select count(*) as n from public.delivery_zones where name like '[COMPLETAR]%'`),
    ).toBe(2)
  })

  it('creates the Tuesday 2x1 as an automatic promo scoped to tacos', async () => {
    const c = await db.pg.query<{
      kind: string
      weekdays: number[]
      auto_apply: boolean
      scope: string
      code: string | null
    }>(`select kind, weekdays, auto_apply, scope, code from public.coupons where auto_apply`)
    expect(c.rows).toEqual([
      { kind: 'two_for_one', weekdays: [2], auto_apply: true, scope: 'category', code: null },
    ])
  })

  it('is safe to run twice', async () => {
    await db.pg.exec(SEED)
    expect(await count(`select count(*) as n from public.products`)).toBe(25)
    expect(await count(`select count(*) as n from public.opening_hours`)).toBe(6)
  })
})
