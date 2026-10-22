// Generates raster icons and the Open Graph image into public/brand from the SVG sources.
// Run: npm run icons   (requires `node scripts/brand/build-logos.mjs` to have produced public/brand/*.svg)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { C, ROOT, lilita, textPath } from './brand/lib.mjs'
import { facadeSvg } from '../src/components/illustrations/facadeMarkup.ts'

const BRAND = path.join(ROOT, 'public', 'brand')
const read = (name) => readFileSync(path.join(BRAND, name))
const render = (svg, width, height = width) =>
  sharp(Buffer.isBuffer(svg) ? svg : Buffer.from(svg), { density: 384 })
    .resize({ width, height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

const flat = { r: 255, g: 244, b: 224, alpha: 1 } // tortilla

/** Square icon: isotipo centred on a tortilla tile, content scaled to `ratio` of the side. */
async function tile(size, ratio, file, svgName = 'isotipo.svg') {
  const inner = Math.round(size * ratio)
  const iso = await render(read(svgName), inner)
  await sharp({ create: { width: size, height: size, channels: 4, background: flat } })
    .composite([{ input: iso, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(BRAND, file))
  console.log(file.padEnd(24), `${size}x${size}`)
}

// Favicon keeps transparency (browsers draw it on tab chrome)
await sharp(await render(read('favicon.svg'), 32))
  .png({ compressionLevel: 9 })
  .toFile(path.join(BRAND, 'favicon-32.png'))
console.log('favicon-32.png'.padEnd(24), '32x32')

await tile(180, 0.78, 'apple-touch-icon.png')
await tile(192, 0.86, 'icon-192.png')
await tile(512, 0.86, 'icon-512.png')
// Maskable: launchers crop to a circle of 80 % of the side → keep the whole mark inside radius 0.4·size.
// Content box 0.56·size has half-diagonal 0.396·size, so every corner stays inside the safe zone.
await tile(512, 0.56, 'maskable-512.png')

// ---------- og-image 1200×630: stacked logo + tagline on the left, facade on the right ----------
const W = 1200
const H = 630
const stacked = await render(read('logo-stacked.svg'), 380, 330)
const f = lilita()
const line = (text, size) => textPath(f, text, size)
const t1 = line('Tacos de barrio.', 46)
const t2 = line('Pedí online.', 46)
const tag = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120">
<g transform="translate(0 52)"><path d="${t1.d}" fill="${C.carbon}"/></g>
<g transform="translate(0 106)"><path d="${t2.d}" fill="${C.chile}"/></g></svg>`
const facade = await render(facadeSvg('day', { staticPlaque: true }), 760, 570)

await sharp({ create: { width: W, height: H, channels: 4, background: flat } })
  .composite([
    { input: facade, left: 430, top: 30 },
    { input: stacked, left: 40, top: 70 },
    { input: await render(tag, 420, 120), left: 50, top: 450 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(BRAND, 'og-image.png'))
console.log('og-image.png'.padEnd(24), `${W}x${H}`)
