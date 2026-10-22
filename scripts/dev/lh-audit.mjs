// One-off Lighthouse drill-down for a single route of the already running preview (see scripts/lighthouse.mjs).
// Usage: node scripts/dev/lh-audit.mjs /menu     (start `vite preview --outDir dist-lh --port 4174` + mock API first)
import { existsSync } from 'node:fs'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const arg = process.argv[2] ?? 'home' // no leading slash: Git Bash rewrites it
const route = arg === 'home' ? '/' : `/${arg}`
const chromePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync)
const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox'] })
const { lhr } = await lighthouse(`http://localhost:4174${route}`, {
  port: chrome.port,
  output: 'json',
  logLevel: 'error',
})
await chrome.kill()

const show = (id, pick) => {
  const a = lhr.audits[id]
  if (!a) return
  console.log(
    `\n## ${a.title} (${a.score === null ? 'n/a' : Math.round(a.score * 100)}) ${a.displayValue ?? ''}`,
  )
  for (const item of (a.details?.items ?? []).slice(0, 12)) console.log('  ', pick(item))
}
show('errors-in-console', (i) => `${i.sourceLocation?.url ?? ''} ${i.description ?? ''}`.slice(0, 220))
show('deprecations', (i) => `${i.value ?? ''} ${i.source?.url ?? ''}`.slice(0, 220))
show('largest-contentful-paint-element', (i) => JSON.stringify(i.items ?? i).slice(0, 300))
show('layout-shifts', (i) => `${i.node?.snippet ?? ''} ${i.score}`.slice(0, 200))
show('render-blocking-resources', (i) => `${i.url} ${i.wastedMs}ms`)
show(
  'unused-javascript',
  (i) => `${i.url} total ${Math.round(i.totalBytes / 1024)}KB wasted ${Math.round(i.wastedBytes / 1024)}KB`,
)
show(
  'network-requests',
  (i) => `${Math.round((i.transferSize ?? 0) / 1024)}KB ${i.resourceType} ${i.url.slice(-90)}`,
)
show('mainthread-work-breakdown', (i) => `${i.groupLabel} ${Math.round(i.duration)}ms`)
show(
  'bootup-time',
  (i) => `${i.url.slice(-80)} total ${Math.round(i.total)}ms scripting ${Math.round(i.scripting)}ms`,
)

console.log('\n## Metrics')
for (const id of [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
]) {
  console.log(`   ${id}: ${lhr.audits[id]?.displayValue} (${Math.round((lhr.audits[id]?.score ?? 0) * 100)})`)
}
console.log(`   performance score: ${Math.round((lhr.categories.performance?.score ?? 0) * 100)}`)
console.log(
  '   LCP element:',
  JSON.stringify(lhr.audits['largest-contentful-paint-element']?.details ?? {}).slice(0, 900),
)
for (const id of ['render-blocking-resources', 'font-display', 'uses-rel-preload', 'server-response-time']) {
  const a = lhr.audits[id]
  if (a && a.score !== null && a.score < 1)
    console.log(
      `   [${id}] ${a.displayValue ?? ''} ${JSON.stringify((a.details?.items ?? []).slice(0, 4).map((i) => i.url ?? i.node?.snippet ?? ''))}`,
    )
}
const m = lhr.audits.metrics?.details?.items?.[0] ?? {}
console.log(
  '   observed:',
  JSON.stringify({
    fcp: m.observedFirstContentfulPaint,
    lcp: m.observedLargestContentfulPaint,
    load: m.observedLoad,
  }),
)
console.log('   simulated:', JSON.stringify({ fcp: m.firstContentfulPaint, lcp: m.largestContentfulPaint }))
for (const r of (lhr.audits['network-requests']?.details?.items ?? []).slice(0, 12))
  console.log(
    `   ${String(Math.round(r.networkRequestTime)).padStart(5)}→${String(Math.round(r.networkEndTime)).padStart(5)} ${r.resourceType} ${r.url.slice(-60)}`,
  )
