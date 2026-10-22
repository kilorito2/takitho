// Builds the final logo system into public/brand/ (text converted to paths, optimized with SVGO).
// Run: node scripts/brand/build-logos.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { optimize } from 'svgo'
import { C, ROOT, lilita, textPath } from './lib.mjs'

const OUT = path.join(ROOT, 'public', 'brand')
mkdirSync(OUT, { recursive: true })

const font = lilita()
const WORD = textPath(font, 'Takitho', 150, { spacing: 2 })

/* ------------------------------------------------------------------ */
/* Isotipo: taco under a striped awning (viewBox 0 0 200 200)           */
/* ------------------------------------------------------------------ */
function awningStripes(fillFor) {
  const n = 7
  const [tx0, tx1, ty] = [34, 166, 26]
  const [bx0, bx1, by] = [10, 190, 78]
  const tw = (tx1 - tx0) / n
  const bw = (bx1 - bx0) / n
  const r = bw / 2
  let out = ''
  for (let i = 0; i < n; i++) {
    const a = tx0 + tw * i
    const b = tx0 + tw * (i + 1)
    const c = bx0 + bw * (i + 1)
    const d = bx0 + bw * i
    out += `<path d="M${a} ${ty}L${b} ${ty}L${c} ${by}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${d} ${by}Z" fill="${fillFor(i)}"/>`
  }
  return out
}

const LETTUCE =
  'M38 120a12.4 12.4 0 0 1 24.8 0a12.4 12.4 0 0 1 24.8 0a12.4 12.4 0 0 1 24.8 0a12.4 12.4 0 0 1 24.8 0a12.4 12.4 0 0 1 24.8 0V128H38Z'
const SHELL = 'M36 118H164A64 62 0 0 1 36 118Z'
const FACE = {
  eyes: [
    [81, 144],
    [119, 144],
  ],
  smile: 'M89 156Q100 167 111 156',
}
const TOMATOES = [
  [62, 114],
  [100, 111],
  [138, 114],
]

function isotipoColor() {
  return `<g stroke="${C.carbon}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
<rect x="30" y="12" width="140" height="12" rx="6" fill="${C.madera}"/>
${awningStripes((i) => (i % 2 === 0 ? C.chile : C.tortilla))}
<path d="${LETTUCE}" fill="${C.nopal}"/>
<path d="${SHELL}" fill="${C.maiz}"/>
</g>
<g fill="${C.chile}">${TOMATOES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5"/>`).join('')}</g>
<path d="M45 130Q51 160 70 172" fill="none" stroke="${C.tortilla}" stroke-width="4" stroke-linecap="round" opacity=".6"/>
<g fill="${C.carbon}">${FACE.eyes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5"/>`).join('')}</g>
<path d="${FACE.smile}" fill="none" stroke="${C.carbon}" stroke-width="5" stroke-linecap="round"/>`
}

function isotipoMono(ink, id) {
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="100" width="200" height="100">
<rect x="0" y="100" width="200" height="100" fill="#fff"/>
<g fill="#000">${FACE.eyes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</g>
<path d="${FACE.smile}" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/>
</mask></defs>
<g stroke="${ink}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
<rect x="30" y="12" width="140" height="12" rx="6" fill="${ink}"/>
${awningStripes((i) => (i % 2 === 0 ? ink : 'none'))}
<path d="${LETTUCE}" fill="none"/>
<path d="${SHELL}" fill="${ink}" mask="url(#${id})"/>
</g>
<g fill="${ink}">${TOMATOES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5"/>`).join('')}</g>`
}

/* Favicon: fewer, chunkier shapes so it survives 16 px */
function faviconSvg() {
  const n = 5
  const [tx0, tx1, ty, bx0, bx1, by] = [30, 170, 22, 8, 192, 84]
  const tw = (tx1 - tx0) / n
  const bw = (bx1 - bx0) / n
  const r = bw / 2
  let awn = ''
  for (let i = 0; i < n; i++) {
    const a = tx0 + tw * i
    const b = tx0 + tw * (i + 1)
    const c = bx0 + bw * (i + 1)
    const d = bx0 + bw * i
    awn += `<path d="M${a} ${ty}L${b} ${ty}L${c} ${by}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${d} ${by}Z" fill="${i % 2 === 0 ? C.chile : C.tortilla}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<g stroke="${C.carbon}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round">
${awn}
<path d="M30 140a14 14 0 0 1 28 0a14 14 0 0 1 28 0a14 14 0 0 1 28 0a14 14 0 0 1 28 0V150H30Z" fill="${C.nopal}"/>
<path d="M22 140H178A78 54 0 0 1 22 140Z" fill="${C.maiz}"/>
</g>
<g fill="${C.carbon}"><circle cx="78" cy="160" r="7"/><circle cx="122" cy="160" r="7"/></g>
</svg>`
}

/* ------------------------------------------------------------------ */
/* Wordmark                                                            */
/* ------------------------------------------------------------------ */
const PAD = 30
const wordBox = (() => {
  const { bbox } = WORD
  const w = Math.ceil(bbox.x2 - bbox.x1) + PAD * 2 + 14
  const h = Math.ceil(bbox.y2 - bbox.y1) + PAD * 2 + 44
  const ox = PAD - bbox.x1
  const oy = PAD - bbox.y1
  return { w, h, ox, oy }
})()

function wordmark(mode, ink) {
  const { ox, oy, w } = wordBox
  const base = `translate(${ox.toFixed(1)} ${oy.toFixed(1)})`
  const stroke = 'stroke-linejoin="round" stroke-linecap="round"'
  const lineY = oy + 40
  const lineW = w - PAD * 2 - 8
  const wave = `M${PAD + 4} ${lineY}q${lineW / 4} 14 ${lineW / 2} 0t${lineW / 2} -2`
  if (mode === 'color') {
    return `<g transform="rotate(-3 ${w / 2} ${wordBox.h / 2})">
<g transform="${base}">
<path d="${WORD.d}" transform="translate(9 11)" fill="${C.chile}" stroke="${C.chile}" stroke-width="16" ${stroke}/>
<path d="${WORD.d}" fill="${C.carbon}" stroke="${C.carbon}" stroke-width="16" ${stroke}/>
<path d="${WORD.d}" fill="${C.maiz}"/>
</g>
<path d="${wave}" fill="none" stroke="${C.carbon}" stroke-width="12" stroke-linecap="round"/>
<path d="${wave}" fill="none" stroke="${C.nopal}" stroke-width="6" stroke-linecap="round"/>
</g>`
  }
  // mono: solid face only (a one-colour shadow just muddies the counters)
  return `<g transform="rotate(-3 ${w / 2} ${wordBox.h / 2})">
<g transform="${base}">
<path d="${WORD.d}" fill="${ink}" stroke="${ink}" stroke-width="3" ${stroke}/>
</g>
<path d="${wave}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
</g>`
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */
const svg = (vb, inner, label = 'Takitho') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${label}">${inner}</svg>`

function full(mode, ink) {
  // horizontal: isotipo left (200), wordmark right scaled to match its visual height
  const iso = mode === 'color' ? isotipoColor() : isotipoMono(ink, 'tk-face-h')
  const scale = 0.95
  const ww = wordBox.w * scale
  const wh = wordBox.h * scale
  const H = 200
  const gap = 6
  const wy = (H - wh) / 2
  const W = 200 + gap + ww
  return svg(
    `0 0 ${Math.ceil(W)} ${H}`,
    `${iso}<g transform="translate(${200 + gap} ${wy.toFixed(1)}) scale(${scale})">${wordmark(mode, ink)}</g>`,
  )
}

function stacked(mode, ink) {
  const iso = mode === 'color' ? isotipoColor() : isotipoMono(ink, 'tk-face-s')
  const scale = 0.62
  const ww = wordBox.w * scale
  const wh = wordBox.h * scale
  const W = Math.max(200, ww)
  const isoX = (W - 200) / 2
  const wordX = (W - ww) / 2
  const H = 200 + wh - 18
  return svg(
    `0 0 ${Math.ceil(W)} ${Math.ceil(H)}`,
    `<g transform="translate(${isoX.toFixed(1)} 0)">${iso}</g><g transform="translate(${wordX.toFixed(1)} ${(200 - 18).toFixed(1)}) scale(${scale})">${wordmark(mode, ink)}</g>`,
  )
}

/* Neon sign: tube outline + hot core, glow via SVG filter */
function neon() {
  const { ox, oy, w, h } = wordBox
  const stroke = 'stroke-linejoin="round" stroke-linecap="round" fill="none"'
  const lineY = oy + 40
  const lineW = w - PAD * 2 - 8
  const wave = `M${PAD + 4} ${lineY}q${lineW / 4} 14 ${lineW / 2} 0t${lineW / 2} -2`
  const tube = (color, sw) =>
    `<g transform="translate(${ox.toFixed(1)} ${oy.toFixed(1)})"><path d="${WORD.d}" stroke="${color}" stroke-width="${sw}" ${stroke}/></g><path d="${wave}" stroke="${color}" stroke-width="${sw}" ${stroke}/>`
  const pad = 40
  const vw = w + pad * 2
  const vh = h + pad * 2
  return svg(
    `0 0 ${vw} ${vh}`,
    `<defs><filter id="tk-glow" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="9" result="b1"/><feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b2"/><feMerge><feMergeNode in="b1"/><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<g transform="translate(${pad} ${pad}) rotate(-3 ${w / 2} ${h / 2})" filter="url(#tk-glow)">
${tube('#FF2E93', 11)}
${tube('#FFE3F1', 3.5)}
</g>`,
    'Takitho, letrero de neón',
  )
}

const files = {
  'logo-full.svg': full('color'),
  'logo-stacked.svg': stacked('color'),
  'isotipo.svg': svg('0 0 200 200', isotipoColor()),
  'logo-wordmark.svg': svg(`0 0 ${wordBox.w} ${wordBox.h}`, wordmark('color')),
  'logo-mono-dark.svg': full('mono', C.carbon),
  'logo-mono-light.svg': full('mono', C.tortilla),
  'logo-neon.svg': neon(),
  'favicon.svg': faviconSvg(),
}

for (const [name, source] of Object.entries(files)) {
  const { data } = optimize(source, {
    multipass: true,
    floatPrecision: 2,
    plugins: [
      {
        name: 'preset-default',
        params: { overrides: { cleanupIds: false } },
      },
    ],
  })
  writeFileSync(path.join(OUT, name), data)
  console.log(name.padEnd(22), (data.length / 1024).toFixed(1) + ' KB')
}

// Wordmark outline as a TS module so UI illustrations (facade sign) can reuse the exact paths.
const genDir = path.join(ROOT, 'src', 'components', 'illustrations')
mkdirSync(genDir, { recursive: true })
const b = WORD.bbox
writeFileSync(
  path.join(genDir, 'wordmarkPath.ts'),
  `// Generated by scripts/brand/build-logos.mjs — do not edit.
export const WORDMARK_PATH =
  '${WORD.d}'
export const WORDMARK_BBOX = { x1: ${b.x1.toFixed(2)}, y1: ${b.y1.toFixed(2)}, x2: ${b.x2.toFixed(2)}, y2: ${b.y2.toFixed(2)} } as const
`,
)
console.log('wordmarkPath.ts written')
