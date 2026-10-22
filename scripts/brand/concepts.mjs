// Generates the three exploratory logo concepts (SVG + PNG at several sizes)
// into docs/brand-exploration. Run: node scripts/brand/concepts.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { C, ROOT, lilita, textPath } from './lib.mjs'

const OUT = path.join(ROOT, 'docs', 'brand-exploration')
mkdirSync(OUT, { recursive: true })

// ---------- (a) Wordmark: hand-painted sign with offset shadow ----------
function conceptA() {
  const f = lilita()
  const size = 150
  const t = textPath(f, 'Takitho', size, { spacing: 2 })
  const pad = 40
  const w = Math.ceil(t.width + pad * 2 + 14)
  const h = 230
  const base = 150
  const shift = `translate(${pad} ${base})`
  const stroke = 'stroke-linejoin="round" stroke-linecap="round"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Takitho">
  <g transform="rotate(-3 ${w / 2} ${h / 2})">
    <g transform="${shift}">
      <path d="${t.d}" transform="translate(9 11)" fill="${C.chile}" stroke="${C.chile}" stroke-width="16" ${stroke}/>
      <path d="${t.d}" fill="${C.carbon}" stroke="${C.carbon}" stroke-width="16" ${stroke}/>
      <path d="${t.d}" fill="${C.maiz}"/>
    </g>
    <path d="M${pad + 6} ${base + 44} q${(w - pad * 2) / 4} 14 ${(w - pad * 2) / 2} 0 t${(w - pad * 2) / 2 - 6} -2" fill="none" stroke="${C.carbon}" stroke-width="12" stroke-linecap="round"/>
    <path d="M${pad + 6} ${base + 44} q${(w - pad * 2) / 4} 14 ${(w - pad * 2) / 2} 0 t${(w - pad * 2) / 2 - 6} -2" fill="none" stroke="${C.nopal}" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>`
}

// ---------- (b) Isotipo: smiling taco under a striped awning ----------
function conceptB() {
  const stripes = 7
  const [tx0, tx1, ty] = [34, 166, 40]
  const [bx0, bx1, by] = [10, 190, 92]
  const tw = (tx1 - tx0) / stripes
  const bw = (bx1 - bx0) / stripes
  let awn = ''
  for (let i = 0; i < stripes; i++) {
    const fill = i % 2 === 0 ? C.chile : C.tortilla
    const a = tx0 + tw * i
    const b = tx0 + tw * (i + 1)
    const c = bx0 + bw * (i + 1)
    const d = bx0 + bw * i
    const r = bw / 2
    awn += `<path d="M${a} ${ty} L${b} ${ty} L${c} ${by} A${r} ${r} 0 0 1 ${d} ${by} Z" fill="${fill}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Takitho">
  <g stroke="${C.carbon}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
    <rect x="30" y="30" width="140" height="12" rx="6" fill="${C.madera}"/>
    ${awn}
    <path d="M38 150 q-10 -30 12 -34 q8 -14 24 -6 q10 -12 26 -2 q14 -10 26 2 q18 -6 24 8 q22 6 12 32 Z" fill="${C.nopal}"/>
    <circle cx="74" cy="126" r="7" fill="${C.chile}"/>
    <circle cx="118" cy="122" r="6" fill="${C.chile}"/>
    <path d="M32 140 H168 A68 56 0 0 1 32 140 Z" fill="${C.maiz}"/>
  </g>
  <circle cx="82" cy="158" r="5" fill="${C.carbon}"/>
  <circle cx="118" cy="158" r="5" fill="${C.carbon}"/>
  <path d="M88 170 Q100 182 112 170" fill="none" stroke="${C.carbon}" stroke-width="5" stroke-linecap="round"/>
</svg>`
}

// ---------- (c) Monogram: T formed by a folded tortilla ----------
function conceptC() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Takitho">
  <g stroke="${C.carbon}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="100" cy="100" r="86" fill="${C.maiz}"/>
    <path d="M14 100 A86 86 0 0 0 186 100 Z" fill="${C.tortilla}"/>
    <path d="M44 56 H156 V86 H116 V152 H84 V86 H44 Z" fill="${C.chile}"/>
  </g>
  <g fill="${C.madera}" opacity=".85">
    <ellipse cx="50" cy="120" rx="5" ry="3.5"/>
    <ellipse cx="148" cy="130" rx="6" ry="4"/>
    <ellipse cx="122" cy="168" rx="4" ry="3"/>
    <ellipse cx="70" cy="166" rx="3.5" ry="2.5"/>
    <ellipse cx="160" cy="76" rx="4" ry="3"/>
  </g>
</svg>`
}

const concepts = {
  'concept-a-wordmark': conceptA(),
  'concept-b-isotipo': conceptB(),
  'concept-c-monograma': conceptC(),
}

for (const [name, svg] of Object.entries(concepts)) {
  writeFileSync(path.join(OUT, `${name}.svg`), svg)
  for (const px of [512, 64, 32, 16]) {
    await sharp(Buffer.from(svg), { density: 300 })
      .resize({ width: px, height: px, fit: 'contain', background: { r: 255, g: 244, b: 224, alpha: 1 } })
      .png()
      .toFile(path.join(OUT, `${name}-${px}.png`))
  }
}

// Contact sheet: each concept at 256 / 64 / 32 / 16 px on tortilla background
const cell = 300
const sheet = []
let i = 0
for (const name of Object.keys(concepts)) {
  for (const [j, px] of [256, 64, 32, 16].entries()) {
    const buf = await sharp(path.join(OUT, `${name}-512.png`))
      .resize(px, px, { kernel: 'lanczos3' })
      .toBuffer()
    sheet.push({
      input: buf,
      left: j === 0 ? 20 : 20 + 256 + 24 + (j - 1) * 90,
      top: i * cell + (j === 0 ? 20 : 20),
    })
  }
  i++
}
await sharp({
  create: { width: 256 + 20 + 3 * 90 + 40, height: cell * 3, channels: 4, background: C.tortilla },
})
  .composite(sheet)
  .png()
  .toFile(path.join(OUT, 'contact-sheet.png'))
console.log('ok')
