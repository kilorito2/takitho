// Rough "what is in the entry chunk" report: groups the source-map sources of dist/assets/index-*.js by package or
// app folder and ranks them by original size. Usage: npx vite build --sourcemap && node scripts/dev/bundle-report.mjs
import { readdirSync, readFileSync } from 'node:fs'

const dir = process.argv[2] ?? 'dist/assets'
const entry = readdirSync(dir).find((f) => /^index-.*\.js$/.test(f))
if (!entry) throw new Error('no entry chunk; build with --sourcemap first')
const map = JSON.parse(readFileSync(`${dir}/${entry}.map`, 'utf8'))

const totals = new Map()
map.sources.forEach((source, i) => {
  const size = (map.sourcesContent?.[i] ?? '').length
  const nm = source.split('node_modules/').pop() ?? source
  const group = source.includes('node_modules/')
    ? nm.startsWith('@')
      ? nm.split('/').slice(0, 2).join('/')
      : nm.split('/')[0]
    : `src/${source.split('src/').pop()?.split('/').slice(0, 2).join('/')}`
  totals.set(group, (totals.get(group) ?? 0) + size)
})
const total = [...totals.values()].reduce((a, b) => a + b, 0)
console.log(`${entry}: ${(total / 1024).toFixed(0)} KB of original source`)
for (const [name, size] of [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${String(Math.round(size / 1024)).padStart(6)} KB  ${name}`)
}
