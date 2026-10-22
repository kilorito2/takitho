import { cashChange } from '@/lib/money'
import { nextStatus, type OrderStatus, type OrderType } from '@/lib/orderStatus'

export type PaymentMethod = 'mercado_pago' | 'cash' | 'transfer'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface KitchenItem {
  id: string
  name: string
  quantity: number
  note: string | null
  modifiers: string[]
}

export interface KitchenOrder {
  id: string
  code: string
  status: OrderStatus
  type: OrderType
  customerName: string
  customerPhone: string
  tableNumber: number | null
  /** "Calle 123, 2º B" for delivery orders. */
  address: string | null
  scheduledFor: string | null
  createdAt: string
  paidAt: string | null
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  cashPaidWith: number | null
  total: number
  items: KitchenItem[]
}

export type Column = 'new' | 'preparing' | 'ready' | 'done'
export const COLUMNS: readonly Column[] = ['new', 'preparing', 'ready', 'done']

/** Board column of a status. Unpaid (online) and cancelled orders are not the kitchen's business. */
export function columnOf(status: OrderStatus): Column | null {
  switch (status) {
    case 'received':
      return 'new'
    case 'preparing':
      return 'preparing'
    case 'ready':
    case 'out_for_delivery':
      return 'ready'
    case 'delivered':
      return 'done'
    case 'pending_payment':
    case 'cancelled':
      return null
  }
}

const MINUTE = 60_000

/**
 * When the kitchen's clock starts for an order: from the moment it was paid (online) or placed, but a scheduled
 * order only starts one prep time before its slot, so a 21:30 order placed at 18:00 is not "3 hours late".
 */
export function timerStart(order: KitchenOrder, prepMinutes: number): Date {
  const placed = new Date(order.paidAt ?? order.createdAt).getTime()
  if (!order.scheduledFor) return new Date(placed)
  const startForSlot = new Date(order.scheduledFor).getTime() - prepMinutes * MINUTE
  return new Date(Math.max(placed, startForSlot))
}

export function elapsedMinutes(order: KitchenOrder, now: Date, prepMinutes: number): number {
  return Math.max(0, Math.floor((now.getTime() - timerStart(order, prepMinutes).getTime()) / MINUTE))
}

export type TimerLevel = 'ok' | 'warn' | 'late'

export function timerLevel(minutes: number, warnAt: number, lateAt: number): TimerLevel {
  if (minutes >= lateAt) return 'late'
  if (minutes >= warnAt) return 'warn'
  return 'ok'
}

export type Board = Record<Column, KitchenOrder[]>

/** Orders per column. Active columns: oldest timer first (what has waited longest goes on top). Done: newest first. */
export function boardOrders(orders: readonly KitchenOrder[], prepMinutes: number): Board {
  const board: Board = { new: [], preparing: [], ready: [], done: [] }
  for (const o of orders) {
    const column = columnOf(o.status)
    if (column) board[column].push(o)
  }
  const byStart = (a: KitchenOrder, b: KitchenOrder) =>
    timerStart(a, prepMinutes).getTime() - timerStart(b, prepMinutes).getTime() ||
    a.code.localeCompare(b.code)
  board.new.sort(byStart)
  board.preparing.sort(byStart)
  board.ready.sort(byStart)
  board.done.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return board
}

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  preparing: 'Empezar a preparar',
  ready: 'Listo',
  out_for_delivery: 'Salió a reparto',
  delivered: 'Entregado',
}

/** The one-tap step forward, in kitchen words. */
export function advanceAction(
  order: Pick<KitchenOrder, 'status' | 'type'>,
): { to: OrderStatus; label: string } | null {
  const to = nextStatus(order.status, order.type)
  const label = to ? ACTION_LABEL[to] : undefined
  return to && label ? { to, label } : null
}

/** The column a drag can drop this order into; null when the next step does not change column. */
export function dragTarget(order: Pick<KitchenOrder, 'status' | 'type'>): Column | null {
  const to = nextStatus(order.status, order.type)
  if (!to) return null
  const target = columnOf(to)
  return target && target !== columnOf(order.status) ? target : null
}

/** What the runner collects when the customer pays in cash: total, what they hand over and the change. */
export function cashToCollect(
  order: KitchenOrder,
): { total: number; paidWith: number | null; change: number | null } | null {
  if (order.paymentMethod !== 'cash' || order.paymentStatus !== 'pending') return null
  const paidWith = order.cashPaidWith
  const result = paidWith === null ? null : cashChange(order.total, paidWith)
  return { total: order.total, paidWith, change: result?.ok ? result.change : null }
}

export function typeLabel(order: Pick<KitchenOrder, 'type' | 'tableNumber'>): string {
  if (order.type === 'delivery') return 'Delivery'
  if (order.type === 'dine_in') return `Mesa ${order.tableNumber ?? '?'}`
  return 'Retiro'
}
