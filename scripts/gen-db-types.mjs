// Generates src/types/database.ts from the migrations by applying them to an in-process Postgres (PGlite).
// Same shape as `supabase gen types typescript`; run `npm run db:types:cloud` to regenerate from a linked project.
// Usage: node scripts/gen-db-types.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTestDb } from '../tests/sql/harness.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const db = await createTestDb()
const { pg } = db

const enums = (
  await pg.query(`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' group by t.typname order by t.typname`)
).rows
const enumNames = new Set(enums.map((e) => e.name))

const SCALARS = {
  uuid: 'string',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  citext: 'string',
  time: 'string',
  timetz: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  date: 'string',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  numeric: 'number',
  float4: 'number',
  float8: 'number',
  bool: 'boolean',
  json: 'Json',
  jsonb: 'Json',
}

function tsType(udt) {
  if (udt.startsWith('_')) return `${tsType(udt.slice(1))}[]`
  if (enumNames.has(udt)) return `Database['public']['Enums']['${udt}']`
  return SCALARS[udt] ?? 'unknown'
}

const columns = (
  await pg.query(`
  select c.table_name, c.column_name, c.udt_name, c.is_nullable = 'YES' as nullable,
         (c.column_default is not null or c.is_identity = 'YES' or c.is_generated = 'ALWAYS') as has_default,
         c.is_identity = 'YES' and c.identity_generation = 'ALWAYS' as always_identity
    from information_schema.columns c join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
   where c.table_schema = 'public' order by c.table_name, c.ordinal_position`)
).rows

const tables = new Map()
for (const c of columns) {
  if (!tables.has(c.table_name)) tables.set(c.table_name, [])
  tables.get(c.table_name).push(c)
}

const fks = (
  await pg.query(`
  select con.conname as name, rel.relname as "table", array_agg(att.attname order by k.ord) as columns,
         ref.relname as ref_table, array_agg(ratt.attname order by k.ord) as ref_columns,
         exists (
           select 1 from pg_index i
            where i.indrelid = con.conrelid and i.indisunique
              and (select array_agg(a.attname order by a.attname) from pg_attribute a
                    where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) =
                  (select array_agg(a2.attname order by a2.attname) from pg_attribute a2
                    where a2.attrelid = con.conrelid and a2.attnum = any(con.conkey))
         ) as one_to_one
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace and n.nspname = 'public'
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace rn on rn.oid = ref.relnamespace and rn.nspname = 'public'
    join lateral unnest(con.conkey, con.confkey) with ordinality as k(attnum, refnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
    join pg_attribute ratt on ratt.attrelid = con.confrelid and ratt.attnum = k.refnum
   where con.contype = 'f'
   group by con.oid, con.conname, rel.relname, ref.relname, con.conrelid
   order by rel.relname, con.conname`)
).rows

const functions = (
  await pg.query(`
  select p.proname as name, pg_get_function_result(p.oid) as returns,
         coalesce((select jsonb_agg(jsonb_build_object('name', n, 'type', t.typname, 'optional', i > (p.pronargs - p.pronargdefaults)) order by i)
                     from unnest(p.proargnames) with ordinality as a(n, i)
                     join lateral (select (p.proargtypes::oid[])[i - 1] as oid) o on true
                     join pg_type t on t.oid = o.oid), '[]') as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname not in ('set_updated_at') and p.pronargs > 0
   order by p.proname`)
).rows
const noArgFns = (
  await pg.query(`
  select p.proname as name, pg_get_function_result(p.oid) as returns
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.pronargs = 0 and p.proname <> 'set_updated_at' order by p.proname`)
).rows

const returnsTs = (r) => {
  if (r === 'void') return 'undefined'
  if (r === 'jsonb' || r === 'json') return 'Json'
  if (r === 'integer' || r === 'bigint') return 'number'
  if (r === 'text') return 'string'
  if (r === 'public.staff_role' || r === 'staff_role') return `Database['public']['Enums']['staff_role']`
  return 'unknown'
}

const out = []
out.push('// Generated by scripts/gen-db-types.mjs from supabase/migrations — DO NOT EDIT.')
out.push(
  '// Same shape as `supabase gen types typescript`; regenerate from a linked project with `npm run db:types:cloud`.',
)
out.push('')
out.push('export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]')
out.push('')
out.push('export interface Database {')
out.push('  public: {')
out.push('    Tables: {')
for (const [name, cols] of tables) {
  out.push(`      ${name}: {`)
  out.push('        Row: {')
  for (const c of cols)
    out.push(`          ${c.column_name}: ${tsType(c.udt_name)}${c.nullable ? ' | null' : ''}`)
  out.push('        }')
  out.push('        Insert: {')
  for (const c of cols) {
    if (c.always_identity) continue
    out.push(
      `          ${c.column_name}${c.has_default || c.nullable ? '?' : ''}: ${tsType(c.udt_name)}${c.nullable ? ' | null' : ''}`,
    )
  }
  out.push('        }')
  out.push('        Update: {')
  for (const c of cols) {
    if (c.always_identity) continue
    out.push(`          ${c.column_name}?: ${tsType(c.udt_name)}${c.nullable ? ' | null' : ''}`)
  }
  out.push('        }')
  const rel = fks.filter((f) => f.table === name)
  if (rel.length === 0) out.push('        Relationships: []')
  else {
    out.push('        Relationships: [')
    for (const f of rel) {
      out.push(
        `          { foreignKeyName: '${f.name}'; columns: [${f.columns.map((c) => `'${c}'`).join(', ')}]; isOneToOne: ${f.one_to_one}; referencedRelation: '${f.ref_table}'; referencedColumns: [${f.ref_columns.map((c) => `'${c}'`).join(', ')}] },`,
      )
    }
    out.push('        ]')
  }
  out.push('      }')
}
out.push('    }')
out.push('    Views: { [_ in never]: never }')
out.push('    Functions: {')
for (const f of functions) {
  const args = f.args.map((a) => `${a.name}${a.optional ? '?' : ''}: ${tsType(a.type)}`).join('; ')
  out.push(`      ${f.name}: { Args: { ${args} }; Returns: ${returnsTs(f.returns)} }`)
}
for (const f of noArgFns)
  out.push(`      ${f.name}: { Args: Record<PropertyKey, never>; Returns: ${returnsTs(f.returns)} }`)
out.push('    }')
out.push('    Enums: {')
for (const e of enums) out.push(`      ${e.name}: ${e.labels.map((l) => `'${l}'`).join(' | ')}`)
out.push('    }')
out.push('    CompositeTypes: { [_ in never]: never }')
out.push('  }')
out.push('}')
out.push('')
out.push("type PublicSchema = Database['public']")
out.push("export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']")
out.push(
  "export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']",
)
out.push(
  "export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']",
)
out.push("export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]")
out.push('')

writeFileSync(path.join(ROOT, 'src', 'types', 'database.ts'), out.join('\n'))
await db.close()
console.log(
  `database.ts: ${tables.size} tables, ${functions.length + noArgFns.length} functions, ${enums.length} enums`,
)
