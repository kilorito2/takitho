// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildOrderInput } from './quote'
import type { CartItem } from './store'

const item = (over: Partial<CartItem> = {}): CartItem => ({
  id: 'l1',
  productId: 'p1',
  quantity: 2,
  modifierIds: ['m1', 'm2'],
  note: '  sin cebolla  ',
  snapshot: { name: 'Tacos', unitPrice: 7200, imagePublicId: null, modifierNames: [] },
  ...over,
})

describe('buildOrderInput', () => {
  it('sends ids, quantities and trimmed notes — never prices', () => {
    const input = buildOrderInput([item()], { type: 'pickup' })
    expect(input).toEqual({
      items: [{ product_id: 'p1', quantity: 2, modifier_ids: ['m1', 'm2'], note: 'sin cebolla' }],
      type: 'pickup',
      schedule: { mode: 'asap' },
    })
    expect(JSON.stringify(input)).not.toMatch(/price|total|unit/i)
  })

  it('omits an empty note', () => {
    expect(buildOrderInput([item({ note: '   ' })], { type: 'pickup' }).items[0]).not.toHaveProperty('note')
  })

  it('adds the coupon, tip and scheduled time when present', () => {
    const input = buildOrderInput([item()], {
      type: 'pickup',
      couponCode: 'MARTES',
      tip: 500,
      scheduledAt: '2026-10-20T22:30:00-03:00',
    })
    expect(input).toMatchObject({
      coupon_code: 'MARTES',
      tip: 500,
      schedule: { mode: 'scheduled', at: '2026-10-20T22:30:00-03:00' },
    })
  })

  it('builds the delivery block only for delivery orders with a zone', () => {
    const delivery = buildOrderInput([item()], {
      type: 'delivery',
      zoneId: 'z1',
      address: { street: ' Av. Siempreviva ', number: '742', floorApt: '3B' },
    })
    expect(delivery.delivery).toEqual({
      zone_id: 'z1',
      street: 'Av. Siempreviva',
      number: '742',
      floor_apt: '3B',
    })
    expect(buildOrderInput([item()], { type: 'pickup', zoneId: 'z1' }).delivery).toBeUndefined()
    expect(buildOrderInput([item()], { type: 'delivery' }).delivery).toBeUndefined()
  })

  it('quotes a delivery before the address is typed using placeholders, so the fee shows early', () => {
    expect(buildOrderInput([item()], { type: 'delivery', zoneId: 'z1' }).delivery).toMatchObject({
      zone_id: 'z1',
      street: 'Sin definir',
      number: '0',
    })
  })

  it('sends the table number only for dine-in', () => {
    expect(buildOrderInput([item()], { type: 'dine_in', tableNumber: 3 }).table_number).toBe(3)
    expect(buildOrderInput([item()], { type: 'pickup', tableNumber: 3 }).table_number).toBeUndefined()
  })
})
