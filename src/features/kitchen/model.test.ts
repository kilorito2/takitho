import { describe, expect, it } from 'vitest'
import {
  advanceAction,
  boardOrders,
  cashToCollect,
  columnOf,
  dragTarget,
  elapsedMinutes,
  timerLevel,
  timerStart,
  typeLabel,
  type KitchenOrder,
} from './model'

const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00-03:00`)

const order = (over: Partial<KitchenOrder> = {}): KitchenOrder => ({
  id: 'o1',
  code: 'TK-0001',
  status: 'received',
  type: 'pickup',
  customerName: 'Ana',
  customerPhone: '+5491112345678',
  tableNumber: null,
  address: null,
  scheduledFor: null,
  createdAt: at('21:00').toISOString(),
  paidAt: null,
  paymentMethod: 'cash',
  paymentStatus: 'pending',
  cashPaidWith: null,
  total: 15000,
  items: [],
  ...over,
})

describe('columnOf', () => {
  it('maps statuses to board columns', () => {
    expect(columnOf('received')).toBe('new')
    expect(columnOf('preparing')).toBe('preparing')
    expect(columnOf('ready')).toBe('ready')
    expect(columnOf('out_for_delivery')).toBe('ready')
    expect(columnOf('delivered')).toBe('done')
  })

  it('keeps unpaid and cancelled orders off the board', () => {
    expect(columnOf('pending_payment')).toBeNull()
    expect(columnOf('cancelled')).toBeNull()
  })
})

describe('timers', () => {
  it('counts from creation, or from payment for online payments', () => {
    const o = order({ createdAt: at('21:00').toISOString(), paidAt: at('21:06').toISOString() })
    expect(timerStart(o, 25)).toEqual(at('21:06'))
    expect(elapsedMinutes(o, at('21:16'), 25)).toBe(10)
  })

  it('never goes negative and floors partial minutes', () => {
    const o = order()
    expect(elapsedMinutes(o, at('20:59'), 25)).toBe(0)
    expect(elapsedMinutes(o, new Date(at('21:00').getTime() + 119_000), 25)).toBe(1)
  })

  it('starts a scheduled order one prep time before its slot, not when it was placed', () => {
    const o = order({ createdAt: at('18:00').toISOString(), scheduledFor: at('21:30').toISOString() })
    expect(timerStart(o, 25)).toEqual(at('21:05'))
    expect(elapsedMinutes(o, at('21:15'), 25)).toBe(10)
  })

  it('does not start a scheduled order earlier than it was placed', () => {
    const o = order({ createdAt: at('21:20').toISOString(), scheduledFor: at('21:30').toISOString() })
    expect(timerStart(o, 25)).toEqual(at('21:20'))
  })

  it('flags warning and late with the configured thresholds', () => {
    expect(timerLevel(9, 10, 20)).toBe('ok')
    expect(timerLevel(10, 10, 20)).toBe('warn')
    expect(timerLevel(19, 10, 20)).toBe('warn')
    expect(timerLevel(20, 10, 20)).toBe('late')
  })
})

describe('boardOrders', () => {
  it('groups by column, oldest first, and hides what does not belong', () => {
    const list = [
      order({ id: 'a', code: 'TK-0003', createdAt: at('21:10').toISOString() }),
      order({ id: 'b', code: 'TK-0001', createdAt: at('21:00').toISOString() }),
      order({ id: 'c', code: 'TK-0002', status: 'preparing', createdAt: at('21:05').toISOString() }),
      order({ id: 'd', status: 'pending_payment' }),
      order({ id: 'e', status: 'cancelled' }),
      order({ id: 'f', status: 'delivered' }),
    ]
    const board = boardOrders(list, 25)
    expect(board.new.map((o) => o.id)).toEqual(['b', 'a'])
    expect(board.preparing.map((o) => o.id)).toEqual(['c'])
    expect(board.ready).toEqual([])
    expect(board.done.map((o) => o.id)).toEqual(['f'])
  })

  it('puts the most recently placed delivery first in the collapsed column', () => {
    const board = boardOrders(
      [
        order({ id: 'old', status: 'delivered', createdAt: at('20:00').toISOString() }),
        order({ id: 'new', status: 'delivered', createdAt: at('21:00').toISOString() }),
      ],
      25,
    )
    expect(board.done.map((o) => o.id)).toEqual(['new', 'old'])
  })
})

describe('advanceAction', () => {
  it('names the next step in kitchen words', () => {
    expect(advanceAction(order({ status: 'received' }))).toEqual({
      to: 'preparing',
      label: 'Empezar a preparar',
    })
    expect(advanceAction(order({ status: 'preparing' }))).toEqual({ to: 'ready', label: 'Listo' })
    expect(advanceAction(order({ status: 'ready', type: 'pickup' }))).toEqual({
      to: 'delivered',
      label: 'Entregado',
    })
    expect(advanceAction(order({ status: 'ready', type: 'dine_in' }))).toEqual({
      to: 'delivered',
      label: 'Entregado',
    })
    expect(advanceAction(order({ status: 'ready', type: 'delivery' }))).toEqual({
      to: 'out_for_delivery',
      label: 'Salió a reparto',
    })
    expect(advanceAction(order({ status: 'out_for_delivery', type: 'delivery' }))).toEqual({
      to: 'delivered',
      label: 'Entregado',
    })
  })

  it('has nothing to do for finished orders', () => {
    expect(advanceAction(order({ status: 'delivered' }))).toBeNull()
    expect(advanceAction(order({ status: 'cancelled' }))).toBeNull()
  })
})

describe('dragTarget', () => {
  it('is the column the order moves to, only when it changes column', () => {
    expect(dragTarget(order({ status: 'received' }))).toBe('preparing')
    expect(dragTarget(order({ status: 'preparing' }))).toBe('ready')
    expect(dragTarget(order({ status: 'ready', type: 'pickup' }))).toBe('done')
    // Out for delivery stays in the "ready" column: it is a button, not a drag.
    expect(dragTarget(order({ status: 'ready', type: 'delivery' }))).toBeNull()
  })
})

describe('cashToCollect', () => {
  it('tells the cashier how much to charge and the change to give', () => {
    expect(cashToCollect(order({ cashPaidWith: 20000 }))).toEqual({
      total: 15000,
      paidWith: 20000,
      change: 5000,
    })
    expect(cashToCollect(order({ cashPaidWith: null }))).toEqual({
      total: 15000,
      paidWith: null,
      change: null,
    })
  })

  it('is null when nothing is owed in cash', () => {
    expect(cashToCollect(order({ paymentMethod: 'mercado_pago', paymentStatus: 'paid' }))).toBeNull()
    expect(cashToCollect(order({ paymentMethod: 'cash', paymentStatus: 'paid' }))).toBeNull()
    expect(cashToCollect(order({ paymentMethod: 'transfer' }))).toBeNull()
  })
})

describe('typeLabel', () => {
  it('says where the order goes', () => {
    expect(typeLabel(order())).toBe('Retiro')
    expect(typeLabel(order({ type: 'delivery' }))).toBe('Delivery')
    expect(typeLabel(order({ type: 'dine_in', tableNumber: 4 }))).toBe('Mesa 4')
  })
})
