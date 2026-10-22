// Dev helper: open a page against the mock backend, optionally act on it, and screenshot.
// Usage: node scripts/dev/mockserve.ts <path|-> <out.png> [--w=390 --h=844 --theme=dark --full --wait=800 --time=open|closed --click=<selector>...]
import { chromium } from '@playwright/test'
import { CLOSED_AT, MockBackend, OPEN_AT } from '../../tests/e2e/support/backend.ts'

const [path, out, ...flags] = process.argv.slice(2)
const opts = new Map<string, string[]>()
for (const f of flags) {
  const [k, ...v] = f.replace(/^--/, '').split('=')
  opts.set(k ?? '', [...(opts.get(k ?? '') ?? []), v.join('=')])
}
const one = (k: string, d: string) => opts.get(k)?.[0] ?? d
if (!path || !out) throw new Error('usage: mockserve.ts <path|-> <out.png> [flags]')

const backend = new MockBackend()
backend.now = one('time', 'open') === 'closed' ? CLOSED_AT : OPEN_AT
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({
  viewport: { width: Number(one('w', '390')), height: Number(one('h', '844')) },
  deviceScaleFactor: 2,
  colorScheme: one('theme', 'light') === 'dark' ? 'dark' : 'light',
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
})
const page = await context.newPage()
await page.clock.install({ time: backend.now })
await backend.install(page)
const problems: string[] = []
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(m.text())
})
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
const target = path === '-' ? '' : path.replace(/^\/+/, '')
await page.goto(`http://localhost:5173/${target}`, { waitUntil: 'networkidle' })
await page.clock.runFor(200)
for (const sel of opts.get('click') ?? []) {
  await page.locator(sel).first().click()
  await page.clock.runFor(400)
}
await page.waitForTimeout(Number(one('wait', '800')))
await page.screenshot({ path: out, fullPage: opts.has('full') })
await browser.close()
if (problems.length) console.log(problems.join('\n'))
console.log('saved', out)
