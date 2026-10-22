import { DndContext } from '@dnd-kit/core'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { expectNoA11yViolations } from '@/test/a11y'
import { toKitchenOrder, type OrderRow } from './api'
import { OrderCard } from './components/OrderCard'
import { useFreshOrders } from './hooks'
import type { KitchenOrder } from './model'

const order = (over: Partial<KitchenOrder> = {}): KitchenOrder => ({
  id: 'o1',
  code: 'TK-0001',
  status: 'received',
  type: 'pickup',
  customerName: 'Ana Pérez',
  customerPhone: '+5491112345678',
  tableNumber: null,
  address: null,
  scheduledFor: null,
  createdAt: '2026-10-20T21:00:00-03:00',
  paidAt: null,
  paymentMethod: 'cash',
  paymentStatus: 'pending',
  cashPaidWith: 20000,
  total: 15000,
  items: [
    {
      id: 'i1',
      name: 'Tacos al pastor con piña',
      quantity: 2,
      note: 'sin cebolla',
      modifiers: ['Maíz', 'Queso extra'],
    },
  ],
  ...over,
})

const row = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1',
  code: 'TK-0007',
  status: 'received',
  type: 'delivery',
  customer_name: 'Ana',
  customer_phone: '+5491112345678',
  delivery_street: 'Av. Siempreviva',
  delivery_number: '742',
  delivery_floor_apt: '2º B',
  delivery_references: 'portón verde',
  scheduled_for: null,
  created_at: '2026-10-20T21:00:00-03:00',
  paid_at: null,
  payment_method: 'cash',
  payment_status: 'pending',
  cash_paid_with: 20000,
  total: 15000,
  tables: null,
  order_items: [
    { id: 'b', name_snapshot: 'Esquites', quantity: 1, note: '  ', sort: 2, order_item_modifiers: [] },
    {
      id: 'a',
      name_snapshot: 'Tacos',
      quantity: 2,
      note: ' sin cebolla ',
      sort: 1,
      order_item_modifiers: [{ name_snapshot: 'Maíz' }],
    },
  ],
  ...over,
})

describe('toKitchenOrder', () => {
  it('flattens the row: items in order, trimmed notes, a readable address', () => {
    const o = toKitchenOrder(row())
    expect(o.items.map((i) => i.name)).toEqual(['Tacos', 'Esquites'])
    expect(o.items[0]).toMatchObject({ note: 'sin cebolla', modifiers: ['Maíz'] })
    expect(o.items[1]?.note).toBeNull()
    expect(o.address).toBe('Av. Siempreviva 742 — 2º B · portón verde')
  })

  it('gives dine-in orders their table number and no address', () => {
    const o = toKitchenOrder(row({ type: 'dine_in', tables: { number: 4 } }))
    expect(o.tableNumber).toBe(4)
    expect(o.address).toBeNull()
  })
})

const props = {
  now: new Date('2026-10-20T21:12:00-03:00'),
  tz: 'America/Argentina/Buenos_Aires',
  prepMinutes: 25,
  warnMinutes: 10,
  lateMinutes: 20,
  isNew: false,
  busy: false,
  onAdvance: vi.fn(),
  onPrint: vi.fn(),
  onSeen: vi.fn(),
}

const renderCard = (o: KitchenOrder, extra: Partial<typeof props> = {}) =>
  render(
    <DndContext>
      <OrderCard order={o} {...props} {...extra} />
    </DndContext>,
  )

describe('OrderCard', () => {
  it('shows what the cook and the runner need: items, modifiers, highlighted note, cash to collect and change', () => {
    renderCard(order())
    expect(screen.getByText('Tacos al pastor con piña')).toBeInTheDocument()
    expect(screen.getByText('Maíz · Queso extra')).toBeInTheDocument()
    expect(screen.getByText(/sin cebolla/)).toBeInTheDocument()
    expect(screen.getByText(/Cobrar \$\s?15\.000 en efectivo/)).toBeInTheDocument()
    expect(screen.getByText(/vuelto \$\s?5\.000/)).toBeInTheDocument()
  })

  it('says it out loud when an order is late, not only with colour', () => {
    renderCard(order(), { now: new Date('2026-10-20T21:25:00-03:00') })
    expect(screen.getByText('25 min')).toBeInTheDocument()
    expect(screen.getByText('Atrasado')).toBeInTheDocument()
  })

  it('advances with one tap and prints on demand', async () => {
    const onAdvance = vi.fn()
    const onPrint = vi.fn()
    renderCard(order(), { onAdvance, onPrint })
    await userEvent.click(screen.getByRole('button', { name: 'Empezar a preparar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir comanda TK-0001' }))
    expect(onAdvance).toHaveBeenCalledWith(expect.objectContaining({ code: 'TK-0001' }))
    expect(onPrint).toHaveBeenCalledTimes(1)
  })

  it('offers a drag handle only when the next step changes column', () => {
    const { unmount } = renderCard(order({ status: 'received' }))
    expect(screen.getByLabelText('Arrastrar TK-0001 a la siguiente columna')).toBeInTheDocument()
    unmount()
    renderCard(order({ status: 'ready', type: 'delivery' }))
    expect(screen.queryByLabelText(/Arrastrar/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salió a reparto' })).toBeInTheDocument()
  })

  it('finished orders are compact: no advance button, still printable', () => {
    renderCard(order({ status: 'delivered' }), { onAdvance: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Entregado' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Imprimir comanda TK-0001' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderCard(order({ scheduledFor: '2026-10-20T21:30:00-03:00' }), { isNew: true })
    await expectNoA11yViolations(container)
  })
})

describe('useFreshOrders', () => {
  it('ignores the first load and reports orders that arrive afterwards', () => {
    const onFresh = vi.fn()
    const first = [order({ id: 'old' })]
    const { result, rerender } = renderHook(({ list }) => useFreshOrders(list, onFresh), {
      initialProps: { list: first },
    })
    expect(onFresh).not.toHaveBeenCalled()

    rerender({ list: [...first, order({ id: 'new', code: 'TK-0002' })] })
    expect(onFresh).toHaveBeenCalledTimes(1)
    expect(onFresh.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ id: 'new' })])
    expect([...result.current.fresh]).toEqual(['new'])

    act(() => {
      result.current.dismiss('new')
    })
    expect(result.current.fresh.size).toBe(0)
  })

  it('does not ring again for orders already seen, or for ones that only changed column', () => {
    const onFresh = vi.fn()
    const a = order({ id: 'a' })
    const { rerender } = renderHook(({ list }) => useFreshOrders(list, onFresh), {
      initialProps: { list: [a] },
    })
    rerender({ list: [{ ...a, status: 'preparing' }] })
    rerender({ list: [a] })
    expect(onFresh).not.toHaveBeenCalled()
  })

  it('counts an online order that gets paid later as new (it was never on the board before)', () => {
    const onFresh = vi.fn()
    const pending = order({ id: 'mp', status: 'pending_payment' })
    const { rerender } = renderHook(({ list }) => useFreshOrders(list, onFresh), {
      initialProps: { list: [pending] as readonly KitchenOrder[] | undefined },
    })
    rerender({ list: [{ ...pending, status: 'received' }] })
    // pending_payment orders are fetched only once paid, so in practice it arrives as a brand-new id
    rerender({ list: [{ ...pending, status: 'received' }, order({ id: 'cash' })] })
    expect(onFresh).toHaveBeenCalledTimes(1)
  })
})
