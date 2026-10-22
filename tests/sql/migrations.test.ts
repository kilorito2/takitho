// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TRANSITION_ROWS } from '../../src/lib/orderStatus.ts'
import { createTestDb, type TestDb } from './harness.ts'

let db: TestDb
beforeAll(async () => {
  db = await createTestDb()
}, 60_000)
afterAll(async () => {
  await db.close()
})

describe('migrations', () => {
  it('apply cleanly and create every table with RLS enabled', async () => {
    const { rows } = await db.pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    )
    expect(rows.length).toBeGreaterThanOrEqual(22)
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([])
  })

  it('seeds a singleton store_settings row', async () => {
    const { rows } = await db.pg.query<{ count: string }>(`select count(*) from public.store_settings`)
    expect(Number(rows[0]?.count)).toBe(1)
    await expect(db.pg.query(`insert into public.store_settings (id) values (2)`)).rejects.toThrow()
  })

  it('keeps the SQL transition table identical to src/lib/orderStatus.ts', async () => {
    const { rows } = await db.pg.query<{ order_type: string; from_status: string; to_status: string }>(
      `select order_type, from_status, to_status from public.order_status_transitions`,
    )
    const sql = rows.map((r) => `${r.order_type}:${r.from_status}>${r.to_status}`).sort()
    const ts = TRANSITION_ROWS.map((r) => `${r.orderType}:${r.from}>${r.to}`).sort()
    expect(sql).toEqual(ts)
  })

  it('ships no function executable by PUBLIC (only the intended grants)', async () => {
    const { rows } = await db.pg.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('public', p.oid, 'execute')`,
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })
})
