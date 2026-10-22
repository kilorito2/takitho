// Dev helper: screenshot a URL with the installed Chrome.
// Usage: node scripts/dev/shot.mjs <url> <out.png> [--w=390] [--h=844] [--theme=light|dark] [--full] [--wait=500] [--click=<selector>]
import { chromium } from '@playwright/test'

const [url, out, ...flags] = process.argv.slice(2)
const opt = Object.fromEntries(
  flags.map((f) => {
    const [k, ...v] = f.replace(/^--/, '').split('=')
    return [k, v.join('=')]
  }),
)
if (!url || !out) {
  console.error('usage: shot.mjs <url> <out.png> [--w= --h= --theme= --full --wait= --click=]')
  process.exit(1)
}

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({
  viewport: { width: Number(opt.w ?? 390), height: Number(opt.h ?? 844) },
  deviceScaleFactor: 2,
  colorScheme: opt.theme === 'dark' ? 'dark' : 'light',
  locale: 'es-AR',
  timezoneId: 'America/Argentina/Buenos_Aires',
})
const page = await context.newPage()
const problems = []
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) problems.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))
await page.goto(url, { waitUntil: 'networkidle' })
if (opt.click) await page.click(opt.click)
await page.waitForTimeout(Number(opt.wait ?? 500))
await page.screenshot({ path: out, fullPage: 'full' in opt })
await browser.close()
if (problems.length) console.log(problems.join('\n'))
console.log('saved', out)
