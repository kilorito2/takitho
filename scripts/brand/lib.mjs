// Shared helpers for brand generation: palette, text-to-path, contrast.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const opentype = require('opentype.js')

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const C = {
  chile: '#C8102E',
  maiz: '#F2B33D',
  nopal: '#2F7D4A',
  rosa: '#E4007C',
  tortilla: '#FFF4E0',
  madera: '#6B3E26',
  carbon: '#1E1A17',
}

export function loadFont(pkg, file) {
  const buf = readFileSync(path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return opentype.parse(ab)
}

export const lilita = () => loadFont('lilita-one', 'lilita-one-latin-400-normal.woff')
export const caveat = () => loadFont('caveat', 'caveat-latin-700-normal.woff')

/**
 * Text → SVG path data with optional letter-spacing and kerning.
 * Returns { d, width, bbox } with the baseline at y=0.
 */
export function textPath(font, text, size, { spacing = 0, x = 0, y = 0 } = {}) {
  const glyphs = font.stringToGlyphs(text)
  const scale = size / font.unitsPerEm
  let cursor = x
  let d = ''
  const bb = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
  glyphs.forEach((g, i) => {
    const p = g.getPath(cursor, y, size)
    d += p.toPathData(2)
    const b = p.getBoundingBox()
    if (Number.isFinite(b.x1)) {
      bb.x1 = Math.min(bb.x1, b.x1)
      bb.y1 = Math.min(bb.y1, b.y1)
      bb.x2 = Math.max(bb.x2, b.x2)
      bb.y2 = Math.max(bb.y2, b.y2)
    }
    let adv = (g.advanceWidth ?? 0) * scale
    const next = glyphs[i + 1]
    if (next) adv += font.getKerningValue(g, next) * scale
    cursor += adv + spacing
  })
  return { d, width: cursor - x, bbox: bb }
}

const lin = (v) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
