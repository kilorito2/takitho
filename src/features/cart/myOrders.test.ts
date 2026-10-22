// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { useMyOrders, type SavedOrder } from './myOrders'

const order = (code: string, over: Partial<SavedOrder> = {}): SavedOrder => ({
  code,
  token: `t-${code}`,
  createdAt: '2026-10-20T22:00:00.000Z',
  total: 16200,
  type: 'pickup',
  paymentMethod: 'cash',
  items: [],
  ...over,
})

beforeEach(() => {
  useMyOrders.setState({ orders: [] })
})

describe('mis pedidos', () => {
  it('keeps the newest first and replaces an order with the same code', () => {
    const { add } = useMyOrders.getState()
    add(order('TK-0001'))
    add(order('TK-0002'))
    add(order('TK-0001', { total: 5 }))
    expect(useMyOrders.getState().orders.map((o) => o.code)).toEqual(['TK-0001', 'TK-0002'])
    expect(useMyOrders.getState().orders[0]?.total).toBe(5)
  })

  it('caps the history at 30 and can remove or clear', () => {
    const { add, remove, clear } = useMyOrders.getState()
    for (let i = 1; i <= 35; i++) add(order(`TK-${String(i).padStart(4, '0')}`))
    expect(useMyOrders.getState().orders).toHaveLength(30)
    expect(useMyOrders.getState().orders[0]?.code).toBe('TK-0035')
    remove('TK-0035')
    expect(useMyOrders.getState().orders[0]?.code).toBe('TK-0034')
    clear()
    expect(useMyOrders.getState().orders).toEqual([])
  })
})
