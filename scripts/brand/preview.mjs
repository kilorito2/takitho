// Renders public/brand/*.svg onto light/dark backgrounds for visual review.
// Run: node scripts/brand/preview.mjs  → docs/brand-exploration/final-preview.png
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { C, ROOT } from './lib.mjs'

const dir = path.join(ROOT, 'public', 'brand')
const rows = [
  ['logo-full.svg', C.tortilla, 760],
  ['logo-stacked.svg', C.tortilla, 380],
  ['logo-mono-dark.svg', C.tortilla, 760],
  ['logo-mono-light.svg', C.carbon, 760],
  ['logo-neon.svg', '#14110f', 640],
  ['isotipo.svg', C.tortilla, 220],
]
const tiles = []
let y = 20
for (const [file, bg, w] of rows) {
  const png = await sharp(readFileSync(path.join(dir, file)), { density: 200 })
    .resize({ width: w })
    .png()
    .toBuffer()
  const meta = await sharp(png).metadata()
  tiles.push({ bg, png, h: meta.height, w: meta.width, y })
  y += meta.height + 40
}
const W = 860
const composite = []
const base = sharp({ create: { width: W, height: y, channels: 4, background: C.tortilla } })
for (const t of tiles) {
  composite.push({
    input: await sharp({ create: { width: W, height: t.h + 40, channels: 4, background: t.bg } })
      .png()
      .toBuffer(),
    left: 0,
    top: t.y - 20,
  })
  composite.push({ input: t.png, left: Math.round((W - t.w) / 2), top: t.y })
}
// small sizes strip
let x = 20
for (const px of [64, 32, 16]) {
  const b = await sharp(readFileSync(path.join(dir, 'favicon.svg')), { density: 600 })
    .resize(px, px)
    .png()
    .toBuffer()
  composite.push({ input: b, left: x, top: y })
  const b2 = await sharp(readFileSync(path.join(dir, 'isotipo.svg')), { density: 600 })
    .resize(px, px)
    .png()
    .toBuffer()
  composite.push({ input: b2, left: x + 120, top: y })
  x += px + 20
}
await base
  .extend({ bottom: 100, background: C.tortilla })
  .composite(composite)
  .png()
  .toFile(path.join(ROOT, 'docs', 'brand-exploration', 'final-preview.png'))
console.log('preview ok')
