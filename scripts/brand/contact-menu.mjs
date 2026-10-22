// Downloads thumbnails of takitho/menu/* from Cloudinary and tiles them for visual QA.
// Run: node scripts/brand/contact-menu.mjs  → docs/brand-exploration/menu-contact.png
import path from 'node:path'
import sharp from 'sharp'
import { ROOT } from './lib.mjs'

const CLOUD = 'tzfvhzgb'
const ids = [
  'taco-al-pastor',
  'taco-asada',
  'taco-suadero',
  'taco-pollo-chipotle',
  'taco-campechano',
  'taco-hongos-rajas',
  'quesabirria',
  'gringa-al-pastor',
  'quesadilla-queso',
  'quesadilla-hongos',
  'quesadilla-chorizo',
  'burrito-takitho',
  'volcanes',
  'nachos-queso',
  'guacamole-totopos',
  'esquites',
  'agua-horchata',
  'agua-jamaica',
  'agua-tamarindo',
  'gaseosa',
  'agua-mineral',
  'churros-dulce-de-leche',
  'flan',
  'combo-takitho',
  'combo-pareja',
]
const size = 240
const cols = 5
const tiles = await Promise.all(
  ids.map(async (id, i) => {
    const res = await fetch(
      `https://res.cloudinary.com/${CLOUD}/image/upload/f_jpg,q_70,c_fill,ar_1:1,w_${size}/takitho/menu/${id}`,
    )
    const buf = Buffer.from(await res.arrayBuffer())
    return { input: buf, left: (i % cols) * size, top: Math.floor(i / cols) * size }
  }),
)
await sharp({
  create: {
    width: cols * size,
    height: Math.ceil(ids.length / cols) * size,
    channels: 3,
    background: '#000',
  },
})
  .composite(tiles)
  .jpeg({ quality: 80 })
  .toFile(path.join(ROOT, 'docs', 'brand-exploration', 'menu-contact.jpg'))
console.log('ok')
