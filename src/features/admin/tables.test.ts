import { describe, expect, it } from 'vitest'
import { cardBoxes, CARDS_PER_PAGE, nextTableNumber, tableFormSchema, tableUrl } from './tables'

describe('tableUrl', () => {
  it('opens the menu with the table number, whatever the trailing slash', () => {
    expect(tableUrl('https://takitho.com.ar', 4)).toBe('https://takitho.com.ar/menu?mesa=4')
    expect(tableUrl('https://takitho.com.ar/', 12)).toBe('https://takitho.com.ar/menu?mesa=12')
    expect(tableUrl(' http://localhost:5173// ', 1)).toBe('http://localhost:5173/menu?mesa=1')
  })
})

describe('nextTableNumber', () => {
  it('goes one above the highest', () => {
    expect(nextTableNumber([])).toBe(1)
    expect(nextTableNumber([1, 2, 5])).toBe(6)
  })
})

describe('tableFormSchema', () => {
  it('takes whole numbers 1–999', () => {
    expect(tableFormSchema.safeParse({ number: '7', label: 'Patio' }).success).toBe(true)
    for (const number of ['0', '1000', '2,5', '', 'a'])
      expect(tableFormSchema.safeParse({ number, label: '' }).success).toBe(false)
  })

  it('keeps the label short', () => {
    expect(tableFormSchema.safeParse({ number: '1', label: 'x'.repeat(21) }).success).toBe(false)
  })
})

describe('cardBoxes', () => {
  it('lays out six cards per A4 page inside the margins without overlapping', () => {
    const boxes = cardBoxes(7)
    expect(boxes.filter((b) => b.page === 0)).toHaveLength(CARDS_PER_PAGE)
    expect(boxes[6]).toMatchObject({ page: 1, x: 10, y: 10 })
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(10)
      expect(b.x + b.w).toBeLessThanOrEqual(200)
      expect(b.y + b.h).toBeLessThanOrEqual(287)
    }
    const first = boxes[0]
    const second = boxes[1]
    const third = boxes[2]
    if (!first || !second || !third) throw new Error('missing boxes')
    expect(second.x).toBeGreaterThanOrEqual(first.x + first.w)
    expect(third.y).toBeGreaterThanOrEqual(first.y + first.h)
  })

  it('is empty for no tables', () => {
    expect(cardBoxes(0)).toEqual([])
  })
})
