// Copies the pure core (src/lib) into supabase/functions/_shared so the Edge Functions (Deno) run the
// exact same code as the browser (ADR-0004).  --check fails when the copies drifted.
// Usage: node scripts/sync-shared.mjs [--check]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILES = ['money', 'phone', 'orderStatus', 'hours', 'pricing']
const DEST = path.join(ROOT, 'supabase', 'functions', '_shared')
const check = process.argv.includes('--check')

const header = (name) =>
  `// AUTO-GENERATED from src/lib/${name}.ts by scripts/sync-shared.mjs — DO NOT EDIT (run \`npm run sync:shared\`).\n`

let drift = 0
mkdirSync(DEST, { recursive: true })
for (const name of FILES) {
  const source = readFileSync(path.join(ROOT, 'src', 'lib', `${name}.ts`), 'utf8')
  const expected = header(name) + source
  const target = path.join(DEST, `${name}.ts`)
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null
  if (current === expected) continue
  if (check) {
    drift++
    console.error(`✗ ${path.relative(ROOT, target)} is out of date`)
  } else {
    writeFileSync(target, expected)
    console.log(`✓ ${path.relative(ROOT, target)}`)
  }
}
if (check) {
  if (drift > 0) {
    console.error('Run: npm run sync:shared')
    process.exit(1)
  }
  console.log('shared core is in sync')
}
