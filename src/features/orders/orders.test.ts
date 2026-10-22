// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ALL_STATUSES } from '@/lib/orderStatus'
import { announcement, currentStepIndex, headline, minutesLeft, railSteps } from './status'
import { orderMessage } from './whatsapp'

describe('railSteps', () => {
  it('has the moto step only for delivery and a counter label for pickup', () => {
    expect(railSteps('delivery').map((s) => s.label)).toEqual([
      'Recibido',
      'En el comal',
      'Empacado',
      'En camino',
      'Entregado',
    ])
    expect(railSteps('pickup').map((s) => s.label)).toEqual([
      'Recibido',
      'En el comal',
      'Listo en el mostrador',
      'Entregado',
    ])
    expect(railSteps('dine_in').at(-1)?.label).toBe('En tu mesa')
  })

  it('follows the same statuses as the state machine', () => {
    expect(railSteps('delivery').map((s) => s.status)).toEqual([
      'received',
      'preparing',
      'ready',
      'out_for_delivery',
      'delivered',
    ])
    expect(railSteps('pickup').map((s) => s.status)).toEqual(['received', 'preparing', 'ready', 'delivered'])
  })
})

describe('currentStepIndex', () => {
  it('maps each status to its step, waiting-for-payment to -1 and cancelled to null', () => {
    expect(currentStepIndex('received', 'pickup')).toBe(0)
    expect(currentStepIndex('ready', 'pickup')).toBe(2)
    expect(currentStepIndex('delivered', 'pickup')).toBe(3)
    expect(currentStepIndex('out_for_delivery', 'delivery')).toBe(3)
    expect(currentStepIndex('pending_payment', 'delivery')).toBe(-1)
    expect(currentStepIndex('cancelled', 'delivery')).toBeNull()
  })
})

describe('copy', () => {
  it('has a headline and an announcement for every status and type', () => {
    for (const status of ALL_STATUSES) {
      for (const type of ['pickup', 'delivery', 'dine_in'] as const) {
        expect(headline(status, type).length).toBeGreaterThan(3)
        expect(announcement(status, type).length).toBeGreaterThan(8)
      }
    }
  })

  it('uses the taquería voice for the key moments', () => {
    expect(headline('received', 'pickup')).toBe('¡Sale! Recibimos tu pedido')
    expect(headline('ready', 'pickup')).toBe('¡Órale, ya está tu orden!')
    expect(announcement('preparing', 'pickup')).toBe('Tu pedido está en el comal.')
  })
})

describe('minutesLeft', () => {
  const created = '2026-10-20T22:00:00.000Z'
  it('counts down to the estimate and never goes negative', () => {
    expect(minutesLeft(created, 25, 'received', new Date('2026-10-20T22:10:00Z'))).toBe(15)
    expect(minutesLeft(created, 25, 'preparing', new Date('2026-10-20T22:40:00Z'))).toBe(0)
  })

  it('is null when there is no estimate or the food is already out', () => {
    expect(minutesLeft(created, null, 'received', new Date(created))).toBeNull()
    for (const status of ['ready', 'out_for_delivery', 'delivered', 'cancelled'] as const)
      expect(minutesLeft(created, 25, status, new Date(created))).toBeNull()
  })
})

describe('orderMessage', () => {
  const order = {
    code: 'TK-0427',
    type: 'pickup' as const,
    total: 16200,
    table_number: null,
    items: [
      {
        name: 'Tacos al pastor',
        quantity: 2,
        modifiers: ['Maíz', 'Queso extra'],
        note: 'sin cebolla',
        line_total: 16200,
      },
    ],
  }

  it('includes the code, items, notes and total — and never a token', () => {
    const text = orderMessage(order, 'Ana')
    expect(text).toContain('Soy Ana.')
    expect(text).toContain('TK-0427 (retiro)')
    expect(text).toContain('• 2 × Tacos al pastor (Maíz, Queso extra) — sin cebolla')
    expect(text).toMatch(/Total: \$\s?16\.200/)
    expect(text.toLowerCase()).not.toContain('token')
  })

  it('names the table for dine-in orders', () => {
    expect(orderMessage({ ...order, type: 'dine_in', table_number: 3 })).toContain('(mesa 3)')
  })
})
