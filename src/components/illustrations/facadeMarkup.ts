// Pure markup generator for the storefront illustration ("la fachada").
// No React, no DOM: the same function feeds the hero component and the og-image script.
import { WORDMARK_BBOX, WORDMARK_PATH } from './wordmarkPath.ts'

export type FacadeTheme = 'day' | 'night'

/** Themeable surfaces. Each key becomes a `.fx-<key>` class and a `--fx-<key>` variable. */
const THEMES: Record<FacadeTheme, Record<string, string>> = {
  day: {
    sky: '#BFE0D6',
    wall: '#2F7D4A',
    roof: '#6B3E26',
    board: '#1E1A17',
    frame: '#6B3E26',
    glass: '#FFE7A8',
    door: '#8A5232',
    chile: '#C8102E',
    cream: '#FFF4E0',
    ground: '#D9C3A0',
    curb: '#B49E7C',
    tile: '#FFFFFF',
    slate: '#2B2623',
    pot: '#B5562F',
    leaf: '#3F9A5E',
  },
  night: {
    sky: '#171B2B',
    wall: '#1F4D31',
    roof: '#4A2A1A',
    board: '#100E0D',
    frame: '#4A2A1A',
    glass: '#FFC95C',
    door: '#5C3520',
    chile: '#A60D26',
    cream: '#CFC2AB',
    ground: '#2A221D',
    curb: '#1C1613',
    tile: '#E6DCC8',
    slate: '#171413',
    pot: '#8F4325',
    leaf: '#2D7A48',
  },
}

/** Non-colour state that flips with the theme (sun/moon, stars, window light spill, sign style). */
const STATE: Record<FacadeTheme, { sun: number; night: number; spill: number }> = {
  day: { sun: 1, night: 0, spill: 0 },
  night: { sun: 0, night: 1, spill: 0.38 },
}

const keys = Object.keys(THEMES.day)

const decl = (theme: FacadeTheme): string =>
  keys.map((k) => `--fx-${k}:${THEMES[theme][k]}`).join(';') +
  `;--fx-sun:${STATE[theme].sun};--fx-night:${STATE[theme].night};--fx-spill:${STATE[theme].spill}`

/** Class rules; `theme` resolves to literal values (rasterisers), `null` keeps CSS variables (live page). */
const rules = (theme: FacadeTheme | null): string => {
  const v = (name: string, literal: string | number): string =>
    theme === null ? `var(--fx-${name})` : String(literal)
  const st = STATE[theme ?? 'day']
  return (
    keys.map((k) => `.fx-${k}{fill:${v(k, THEMES[theme ?? 'day'][k] ?? '')}}`).join('') +
    `.fx-sun{opacity:${v('sun', st.sun)}}.fx-night{opacity:${v('night', st.night)}}.fx-spill{opacity:${v('spill', st.spill)}}`
  )
}

/**
 * CSS for the live (themed) illustration. Follows the same theming contract as the app:
 * `data-theme` wins, otherwise `prefers-color-scheme`.
 */
export function facadeLiveCss(): string {
  return (
    `:root{${decl('day')}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl('night')}}}` +
    `:root[data-theme="dark"]{${decl('night')}}` +
    rules(null)
  )
}

/** Self-contained CSS for one fixed theme (used when rasterising with sharp). */
export function facadeStaticCss(theme: FacadeTheme): string {
  return rules(theme)
}

const tx = (n: number): string => n.toFixed(1)

function papelPicado(): string {
  const palette = ['chile', 'maiz', 'nopal', 'rosa', 'cream']
  const fills: Record<string, string> = {
    chile: 'class="fx-chile"',
    maiz: 'fill="#F2B33D"',
    nopal: 'fill="#3F9A5E"',
    rosa: 'fill="#E4007C"',
    cream: 'class="fx-cream"',
  }
  const [x0, y0, cx, cy, x1, y1] = [14, 22, 320, 70, 626, 22] as const
  const count = 13
  let flags = ''
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1
    const paint = fills[palette[i % palette.length] ?? 'chile'] ?? 'fill="#C8102E"'
    const k = i % 2 === 0 ? 1 : -1
    // Cut-outs use the sky colour so they read as holes in the paper.
    flags += `<g transform="translate(${tx(x)} ${tx(y)})"><g class="fx-flag" style="--k:${k}"><g class="fx-flag-idle" style="--k:${k};--d:${(i * 0.37).toFixed(2)}s">
<path d="M-17 0H17V24L8.5 19L0 24L-8.5 19L-17 24Z" ${paint}/>
<circle class="fx-sky" cx="0" cy="8" r="3.4"/><circle class="fx-sky" cx="-9" cy="6" r="1.7"/><circle class="fx-sky" cx="9" cy="6" r="1.7"/>
<path class="fx-sky" d="M-5 14L0 11L5 14L0 17Z"/></g></g></g>`
  }
  return `<g class="fx-papel"><path d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}" fill="none" stroke="#6B3E26" stroke-width="1.8"/>${flags}</g>`
}

function awning(): string {
  const n = 11
  const [tx0, tx1, ty] = [112, 528, 222]
  const [bx0, bx1, by] = [92, 548, 270]
  const tw = (tx1 - tx0) / n
  const bw = (bx1 - bx0) / n
  const r = bw / 2
  let out = ''
  for (let i = 0; i < n; i++) {
    const a = tx0 + tw * i
    const b = tx0 + tw * (i + 1)
    const c = bx0 + bw * (i + 1)
    const d = bx0 + bw * i
    out += `<path class="${i % 2 === 0 ? 'fx-chile' : 'fx-cream'}" d="M${tx(a)} ${ty}L${tx(b)} ${ty}L${tx(c)} ${by}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${tx(d)} ${by}Z"/>`
  }
  return `<g class="fx-awning"><g stroke="#1E1A17" stroke-width="3" stroke-linejoin="round">${out}</g><rect class="fx-roof" x="104" y="214" width="432" height="10" rx="5"/></g>`
}

function pots(): string {
  const cactus = (cx: number) =>
    `<g class="fx-leaf" stroke="#1E1A17" stroke-width="2"><ellipse cx="${cx}" cy="352" rx="9" ry="15"/><ellipse cx="${cx - 12}" cy="360" rx="7" ry="11" transform="rotate(-25 ${cx - 12} 360)"/><ellipse cx="${cx + 12}" cy="358" rx="7" ry="12" transform="rotate(25 ${cx + 12} 358)"/></g>`
  const flowers = (cx: number) =>
    `<g><path d="M${cx - 10} 372Q${cx - 16} 352 ${cx - 12} 340M${cx} 372Q${cx} 350 ${cx + 2} 334M${cx + 10} 372Q${cx + 17} 354 ${cx + 13} 344" fill="none" stroke="#3F9A5E" stroke-width="3" stroke-linecap="round"/>
<circle cx="${cx - 12}" cy="338" r="6" fill="#E4007C"/><circle cx="${cx + 2}" cy="332" r="6.5" fill="#F2B33D"/><circle cx="${cx + 13}" cy="342" r="6" fill="#E4007C"/></g>`
  const pot = (cx: number) =>
    `<path class="fx-pot" d="M${cx - 19} 368H${cx + 19}L${cx + 14} 394H${cx - 14}Z" stroke="#1E1A17" stroke-width="2.5" stroke-linejoin="round"/><rect class="fx-pot" x="${cx - 22}" y="364" width="44" height="8" rx="3" stroke="#1E1A17" stroke-width="2.5"/>`
  return `${cactus(134)}${pot(134)}${flowers(256)}${pot(256)}`
}

/** The painted sign: day = coloured lettering, night = neon tubes (switched by `.fx-sun` / `.fx-night`). */
function sign(): string {
  const bw = WORDMARK_BBOX.x2 - WORDMARK_BBOX.x1
  const bh = WORDMARK_BBOX.y2 - WORDMARK_BBOX.y1
  const s = 300 / bw
  const x = 320 - (bw * s) / 2 - WORDMARK_BBOX.x1 * s
  const y = 176 - (bh * s) / 2 - WORDMARK_BBOX.y1 * s
  const g = `translate(${tx(x)} ${tx(y)}) scale(${s.toFixed(4)})`
  return `<rect class="fx-board" x="112" y="134" width="416" height="84" rx="12" stroke="#F2B33D" stroke-width="3"/>
<rect x="120" y="142" width="400" height="68" rx="8" fill="none" stroke="#F2B33D" stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="2 6" stroke-linecap="round"/>
<g class="fx-sun" transform="${g}" stroke-linejoin="round">
<path d="${WORDMARK_PATH}" transform="translate(6 7)" fill="#C8102E" stroke="#C8102E" stroke-width="12"/>
<path d="${WORDMARK_PATH}" fill="#1E1A17" stroke="#1E1A17" stroke-width="12"/>
<path d="${WORDMARK_PATH}" fill="#F2B33D"/></g>
<g class="fx-night" transform="${g}" filter="url(#fx-glow)" fill="none" stroke-linejoin="round" stroke-linecap="round">
<path d="${WORDMARK_PATH}" stroke="#FF2E93" stroke-width="9"/><path d="${WORDMARK_PATH}" stroke="#FFE3F1" stroke-width="3"/></g>`
}

/** Stars + moon + sun share a position; opacity decides which one is up. */
function sky(): string {
  const stars = [
    [40, 110],
    [92, 70],
    [150, 100],
    [230, 60],
    [300, 105],
    [380, 64],
    [450, 98],
    [520, 56],
    [604, 112],
    [20, 190],
    [610, 200],
  ]
  return `<circle class="fx-sun" cx="566" cy="86" r="30" fill="#F2B33D"/>
<g class="fx-night"><circle cx="566" cy="86" r="24" fill="#FFF4E0"/><circle class="fx-sky" cx="576" cy="80" r="21"/>${stars
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 2 : 1.4}" fill="#FFF4E0"/>`)
    .join('')}</g>`
}

export interface FacadeOptions {
  /** Draw a static ABIERTO plaque on the door (the live page overlays a real flipping sign instead). */
  staticPlaque?: boolean
}

/** Inner SVG markup for viewBox "0 0 640 480". */
export function facadeMarkup({ staticPlaque = false }: FacadeOptions = {}): string {
  return `<defs>
<pattern id="fx-tile" width="16" height="16" patternUnits="userSpaceOnUse"><rect class="fx-tile" width="16" height="16"/><path d="M8 1.5L14.5 8L8 14.5L1.5 8Z" fill="#2C5BA3"/><circle cx="8" cy="8" r="2.4" fill="#F2B33D"/><path d="M0 0H16V16H0Z" fill="none" stroke="#2C5BA3" stroke-width=".6" opacity=".5"/></pattern>
<filter id="fx-soft" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="fx-glow" x="-20%" y="-60%" width="140%" height="220%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect class="fx-sky" width="640" height="480"/>
${sky()}
<rect class="fx-ground" y="408" width="640" height="72"/>
<rect class="fx-curb" y="408" width="640" height="8"/>
<path d="M0 448H640M80 416V480M240 416V480M400 416V480M560 416V480" stroke="#1E1A17" stroke-opacity=".12" stroke-width="2"/>
<ellipse class="fx-spill" cx="196" cy="436" rx="150" ry="22" fill="#FFC95C" opacity="0" filter="url(#fx-soft)"/>
<rect class="fx-roof" x="56" y="94" width="528" height="26" rx="4"/>
<rect x="56" y="112" width="528" height="8" fill="#1E1A17" fill-opacity=".25"/>
<rect class="fx-wall" x="64" y="118" width="512" height="290"/>
${sign()}
${awning()}
<rect x="100" y="270" width="440" height="10" fill="#1E1A17" fill-opacity=".18"/>
<rect class="fx-frame" x="88" y="284" width="216" height="108" rx="6"/>
<rect class="fx-glass" x="98" y="294" width="196" height="88"/>
<rect x="193" y="294" width="6" height="88" class="fx-frame"/><rect x="98" y="335" width="196" height="6" class="fx-frame"/>
<path class="fx-chile" d="M98 294H294V306Q284 314 274 306Q264 314 254 306Q244 314 234 306Q224 314 214 306Q204 314 194 306Q184 314 174 306Q164 314 154 306Q144 314 134 306Q124 314 114 306Q104 314 98 306Z"/>
<rect class="fx-frame" x="82" y="390" width="228" height="10" rx="3"/>
${pots()}
<rect class="fx-frame" x="378" y="270" width="124" height="140" rx="4"/>
<rect class="fx-door" x="386" y="278" width="108" height="130"/>
<rect class="fx-glass" x="400" y="292" width="80" height="64" stroke="#1E1A17" stroke-width="3"/>
<path d="M440 292V356M400 324H480" stroke="#1E1A17" stroke-width="3"/>
<rect x="400" y="368" width="80" height="30" rx="2" fill="#1E1A17" fill-opacity=".16"/>
<circle cx="484" cy="360" r="4.5" fill="#F2B33D" stroke="#1E1A17" stroke-width="2"/>
<rect x="64" y="392" width="512" height="16" fill="url(#fx-tile)"/>
<rect x="64" y="390" width="512" height="3" fill="#1E1A17" fill-opacity=".35"/>
<path class="fx-slate" d="M524 408L530 366H562L568 408Z" stroke="#6B3E26" stroke-width="4" stroke-linejoin="round"/>
<path d="M536 378H556M534 388H558M538 398H554" stroke="#FFF4E0" stroke-width="2" stroke-linecap="round" opacity=".8"/>
${staticPlaque ? `<g><rect x="418" y="306" width="44" height="26" rx="5" fill="#2F7D4A" stroke="#1E1A17" stroke-width="2.5"/><circle cx="440" cy="319" r="5" fill="#FFF4E0"/></g>` : ''}
${papelPicado()}`
}

export function facadeSvg(theme: FacadeTheme, options: FacadeOptions = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><style>${facadeStaticCss(theme)}</style>${facadeMarkup(options)}</svg>`
}
