import type { OrderStatus } from '@/lib/orderStatus'
import { staffClient } from '@/lib/supabaseStaff'
import type { KitchenOrder } from './model'

// One literal on purpose: supabase-js derives the row type from the select string at compile time.
const ORDER_COLUMNS =
  'id, code, status, type, customer_name, customer_phone, delivery_street, delivery_number, delivery_floor_apt, delivery_references, scheduled_for, created_at, paid_at, payment_method, payment_status, cash_paid_with, total, tables(number), order_items(id, name_snapshot, quantity, note, sort, order_item_modifiers(name_snapshot))'

/** Delivered orders stay visible (collapsed) for the shift; older ones live in the admin. */
const DELIVERED_WINDOW_HOURS = 12

export async function fetchRows(now: Date) {
  const since = new Date(now.getTime() - DELIVERED_WINDOW_HOURS * 3_600_000).toISOString()
  const { data, error } = await staffClient()
    .from('orders')
    .select(ORDER_COLUMNS)
    .or(
      `status.in.(received,preparing,ready,out_for_delivery),and(status.eq.delivered,updated_at.gte.${since})`,
    )
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

export type OrderRow = Awaited<ReturnType<typeof fetchRows>>[number]

export function toKitchenOrder(row: OrderRow): KitchenOrder {
  const address = [row.delivery_street, row.delivery_number].filter(Boolean).join(' ')
  const extra = [row.delivery_floor_apt, row.delivery_references].filter(Boolean).join(' · ')
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    type: row.type,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    tableNumber: row.tables?.number ?? null,
    address: row.type === 'delivery' ? [address, extra].filter(Boolean).join(' — ') : null,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    cashPaidWith: row.cash_paid_with,
    total: row.total,
    items: [...row.order_items]
      .sort((a, b) => a.sort - b.sort)
      .map((i) => ({
        id: i.id,
        name: i.name_snapshot,
        quantity: i.quantity,
        note: i.note?.trim() ? i.note.trim() : null,
        modifiers: i.order_item_modifiers.map((m) => m.name_snapshot),
      })),
  }
}

export async function fetchOrders(now = new Date()): Promise<KitchenOrder[]> {
  return (await fetchRows(now)).map(toKitchenOrder)
}

export interface KitchenSettings {
  prepMinutes: number
  warnMinutes: number
  lateMinutes: number
}

export async function fetchKitchenSettings(): Promise<KitchenSettings> {
  const { data, error } = await staffClient()
    .from('store_settings')
    .select('prep_minutes, timer_warn_minutes, timer_late_minutes')
    .eq('id', 1)
    .single()
  if (error) throw new Error(error.message)
  return {
    prepMinutes: data.prep_minutes,
    warnMinutes: data.timer_warn_minutes,
    lateMinutes: data.timer_late_minutes,
  }
}

/** The state machine lives in Postgres (ADR-0005): an invalid step fails there, whatever this screen believes. */
export async function advanceOrder(orderId: string, to: OrderStatus): Promise<void> {
  const { error } = await staffClient().rpc('transition_order', { p_order_id: orderId, p_to: to })
  if (error) throw new Error(error.message)
}

export async function setProductAvailable(productId: string, available: boolean): Promise<void> {
  const { error } = await staffClient().rpc('set_product_available', {
    p_product_id: productId,
    p_available: available,
  })
  if (error) throw new Error(error.message)
}

export async function setStorePaused(paused: boolean): Promise<void> {
  const { error } = await staffClient().rpc('set_store_paused', { p_paused: paused })
  if (error) throw new Error(error.message)
}
