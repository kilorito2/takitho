// Lighthouse (mobile preset) over the public routes, against a production build pointed at a local mock of the
// Supabase REST API (scripts/dev/mock-api.ts), so the pages render real content without a cloud project.
// Fails below the CONSTRAINTS.md thresholds.   Usage: node scripts/lighthouse.mjs
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'

const PREVIEW_PORT = 4174
const API_PORT = 54321
const BASE = `http://localhost:${PREVIEW_PORT}`
// LH_ROUTES=home,menu limits the run (Git Bash rewrites values that start with "/", hence no slashes).
const ROUTES = (process.env.LH_ROUTES ?? 'home,menu,checkout,mis-pedidos,staff/login')
  .split(',')
  .map((r) => (r === 'home' ? '/' : `/${r}`))
const MIN = { performance: 0.9, accessibility: 0.9, 'best-practices': 0.9, seo: 0.9 }
const MAX_LCP_MS = 2500

const chromePath =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find(existsSync)

console.log('Building against the mock API…')
const build = process.env.LH_SKIP_BUILD
  ? { status: 0 }
  : spawnSync('npx', ['vite', 'build', '--outDir', 'dist-lh', '--emptyOutDir'], {
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_SUPABASE_URL: `http://localhost:${API_PORT}`,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_lighthouse_000000',
        VITE_CLOUDINARY_CLOUD_NAME: 'tzfvhzgb',
        VITE_SITE_URL: BASE,
      },
    })
if (build.status !== 0) process.exit(build.status ?? 1)

const children = [
  spawn('node', ['scripts/dev/mock-api.ts', String(API_PORT)], { shell: true, stdio: 'ignore' }),
  spawn('npx', ['vite', 'preview', '--outDir', 'dist-lh', '--port', String(PREVIEW_PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  }),
]
const stop = () => {
  for (const child of children) {
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill()
  }
}

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).status < 500) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url} did not start`)
}

let failed = false
try {
  await waitFor(BASE)
  await waitFor(`http://localhost:${API_PORT}/rest/v1/categories`)
  const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox'] })
  for (const route of ROUTES) {
    const { lhr } = await lighthouse(BASE + route, { port: chrome.port, output: 'json', logLevel: 'error' })
    const scores = Object.fromEntries(Object.keys(MIN).map((k) => [k, lhr.categories[k]?.score ?? 0]))
    const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity
    // Private pages (cart, order lists, staff login) are deliberately kept out of search (robots.txt): SEO does not apply.
    const indexable = route === '/' || route === '/menu'
    const bad = Object.entries(MIN).filter(([k, min]) => (indexable || k !== 'seo') && (scores[k] ?? 0) < min)
    const line = Object.entries(scores)
      .map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}`)
      .join(' · ')
    console.log(`${route.padEnd(16)} ${line} · LCP ${(lcp / 1000).toFixed(2)} s`)
    if (process.env.LH_DETAILS) {
      for (const cat of Object.keys(MIN)) {
        for (const ref of lhr.categories[cat]?.auditRefs ?? []) {
          const a = lhr.audits[ref.id]
          if (a && a.score !== null && a.score < 0.9 && ref.weight > 0)
            console.log(
              `   [${cat}] ${a.title} (${Math.round(a.score * 100)})${a.displayValue ? ` — ${a.displayValue}` : ''}`,
            )
        }
      }
    }
    if (bad.length > 0 || lcp > MAX_LCP_MS) failed = true
  }
  await chrome.kill()
} finally {
  stop()
}
if (failed) {
  console.error('Lighthouse thresholds not met (≥ 90 everywhere, LCP < 2.5 s)')
  process.exit(1)
}
