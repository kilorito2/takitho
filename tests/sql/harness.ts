// Runs the real migrations on an in-process Postgres (PGlite) so RLS, grants and SQL functions are
// tested without Docker. Supabase-provided pieces (auth.*, realtime.send, roles) are minimal shims.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations')

const SHIMS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema realtime;
  create table realtime.sent (topic text, event text, payload jsonb, private boolean);
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void language sql as $$ insert into realtime.sent values (topic, event, payload, private) $$;

  create publication supabase_realtime;
`

export type Actor = { kind: 'anon' } | { kind: 'service' } | { kind: 'staff'; id: string }

export interface TestDb {
  pg: PGlite
  /** Run `fn` as the given API role (anon / signed-in staff / service role), like PostgREST does. */
  as<T>(actor: Actor, fn: (q: PGlite['query']) => Promise<T>): Promise<T>
  /** Create a staff user + profile and return its id. */
  addStaff(role: 'admin' | 'kitchen', name?: string): Promise<string>
  close(): Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite()
  await pg.exec(SHIMS)
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await pg.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'))
  }

  const as: TestDb['as'] = async (actor, fn) => {
    const role = actor.kind === 'anon' ? 'anon' : actor.kind === 'service' ? 'service_role' : 'authenticated'
    await pg.exec(`set role ${role}`)
    await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      actor.kind === 'staff' ? actor.id : '',
    ])
    try {
      return await fn(pg.query.bind(pg))
    } finally {
      await pg.exec('reset role')
      await pg.query(`select set_config('request.jwt.claim.sub', '', false)`)
    }
  }

  const addStaff: TestDb['addStaff'] = async (role, name = role) => {
    const u = await pg.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [
      `${name}@takitho.test`,
    ])
    const id = u.rows[0]?.id
    if (!id) throw new Error('could not create user')
    await pg.query(`insert into public.profiles (id, full_name, email, role) values ($1, $2, $3, $4)`, [
      id,
      name,
      `${name}@takitho.test`,
      role,
    ])
    return id
  }

  return { pg, as, addStaff, close: () => pg.close() }
}

/** A minimal valid payload for public.create_order_tx(). */
export function orderPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idempotency_key: crypto.randomUUID(),
    request_hash: 'hash-a',
    business_date: '2026-10-19',
    initial_status: 'received',
    type: 'pickup',
    customer: { name: 'Ana', phone: '+5491112345678' },
    delivery: {},
    totals: { subtotal: 6000, delivery_fee: 0, discount: 0, tip: 0, total: 6000 },
    payment: { method: 'cash', cash_paid_with: 10000 },
    estimated_minutes: 25,
    client_ip_hash: 'iphash',
    items: [
      {
        product_id: null,
        name: 'Tacos al pastor',
        unit_price: 6000,
        quantity: 1,
        line_total: 6000,
        note: 'sin cebolla',
        modifiers: [{ modifier_id: null, name: 'Maíz', price_delta: 0 }],
      },
    ],
    ...over,
  }
}
