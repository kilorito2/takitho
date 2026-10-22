// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ALL_STATUSES,
  allowedTransitions,
  canTransition,
  isTerminal,
  nextStatus,
  TRANSITION_ROWS,
  type OrderStatus,
  type OrderType,
} from './orderStatus.ts'

const TYPES: OrderType[] = ['pickup', 'delivery', 'dine_in']

describe('allowedTransitions', () => {
  it('walks the pickup flow one step at a time', () => {
    expect(allowedTransitions('pending_payment', 'pickup')).toEqual(['received', 'cancelled'])
    expect(allowedTransitions('received', 'pickup')).toEqual(['preparing', 'cancelled'])
    expect(allowedTransitions('preparing', 'pickup')).toEqual(['ready', 'cancelled'])
    expect(allowedTransitions('ready', 'pickup')).toEqual(['delivered', 'cancelled'])
  })

  it('sends delivery orders through out_for_delivery', () => {
    expect(allowedTransitions('ready', 'delivery')).toEqual(['out_for_delivery', 'cancelled'])
    expect(allowedTransitions('out_for_delivery', 'delivery')).toEqual(['delivered', 'cancelled'])
  })

  it('treats dine_in like pickup (no out_for_delivery)', () => {
    expect(allowedTransitions('ready', 'dine_in')).toEqual(['delivered', 'cancelled'])
  })

  it('has no way out of out_for_delivery for non-delivery orders', () => {
    expect(allowedTransitions('out_for_delivery', 'pickup')).toEqual([])
  })

  it('never leaves a terminal state', () => {
    for (const type of TYPES) {
      expect(allowedTransitions('delivered', type)).toEqual([])
      expect(allowedTransitions('cancelled', type)).toEqual([])
    }
  })
})

describe('canTransition', () => {
  it('rejects skipping steps', () => {
    expect(canTransition('received', 'ready', 'pickup')).toBe(false)
    expect(canTransition('received', 'delivered', 'delivery')).toBe(false)
    expect(canTransition('preparing', 'out_for_delivery', 'delivery')).toBe(false)
  })

  it('rejects going backwards', () => {
    expect(canTransition('ready', 'preparing', 'pickup')).toBe(false)
    expect(canTransition('delivered', 'ready', 'pickup')).toBe(false)
  })

  it('rejects out_for_delivery for non-delivery orders', () => {
    expect(canTransition('ready', 'out_for_delivery', 'pickup')).toBe(false)
    expect(canTransition('ready', 'out_for_delivery', 'dine_in')).toBe(false)
  })

  it('allows cancelling from every non-terminal state', () => {
    for (const status of ALL_STATUSES.filter((s) => !isTerminal(s))) {
      expect(canTransition(status, 'cancelled', 'delivery')).toBe(true)
    }
  })

  it('rejects a no-op transition', () => {
    expect(canTransition('received', 'received', 'pickup')).toBe(false)
  })
})

describe('nextStatus', () => {
  it('returns the forward step used by the kitchen "advance" button', () => {
    expect(nextStatus('received', 'pickup')).toBe('preparing')
    expect(nextStatus('ready', 'delivery')).toBe('out_for_delivery')
    expect(nextStatus('ready', 'dine_in')).toBe('delivered')
  })

  it('returns null at the end of the flow', () => {
    expect(nextStatus('delivered', 'pickup')).toBeNull()
    expect(nextStatus('cancelled', 'pickup')).toBeNull()
  })
})

describe('isTerminal', () => {
  it.each<[OrderStatus, boolean]>([
    ['delivered', true],
    ['cancelled', true],
    ['ready', false],
    ['pending_payment', false],
  ])('%s → %s', (status, expected) => {
    expect(isTerminal(status)).toBe(expected)
  })
})

describe('TRANSITION_ROWS (seed for the SQL table)', () => {
  it('has one row per allowed transition and type, matching allowedTransitions', () => {
    const fromRows = (type: OrderType, from: OrderStatus) =>
      TRANSITION_ROWS.filter((r) => r.orderType === type && r.from === from).map((r) => r.to)
    for (const type of TYPES) {
      for (const status of ALL_STATUSES) {
        expect(fromRows(type, status).sort()).toEqual([...allowedTransitions(status, type)].sort())
      }
    }
  })
})
