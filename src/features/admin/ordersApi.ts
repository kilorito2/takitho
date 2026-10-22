import { staffClient } from '@/lib/supabaseStaff'
import type { OrderStatus, OrderType } from '@/lib/orderStatus'
import { safeSearch, type AdminOrderRow } from './orders'

export interface OrderFilters {
  from: string
  to: string
  status: OrderStatus | 'all'
  type: OrderType | 'all'
  search: string
}

export const PAGE_SIZE = 25
const EXPORT_LIMIT = 5000

// One literal on purpose: supabase-js derives the row type from the select string at compile time.
const LIST_COLUMNS =
  'id, code, business_date, created_at, status, type, customer_name, customer_phone, delivery_street, delivery_number, payment_method, payment_status, subtotal, discount, delivery_fee, tip, total, order_items(name_snapshot, quantity, sort)'

function query(f: OrderFilters) {
  let q = staffClient()
    .from('orders')
    .select(LIST_COLUMNS, { count: 'exact' })
    .gte('business_date', f.from)
    .lte('business_date', f.to)
  if (f.status !== 'all') q = q.eq('status', f.status)
  if (f.type !== 'all') q = q.eq('type', f.type)
  const term = safeSearch(f.search)
  if (term) q = q.or(`code.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`)
  return q.order('created_at', { ascending: false })
}

type ListRow = NonNullable<Awaited<ReturnType<typeof query>>['data']>[number]

function toRow(r: ListRow): AdminOrderRow {
  return {
    id: r.id,
    code: r.code,
    businessDate: r.business_date,
    createdAt: r.created_at,
    status: r.status,
    type: r.type,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    address: [r.delivery_street, r.delivery_number].filter(Boolean).join(' '),
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    subtotal: r.subtotal,
    discount: r.discount,
    deliveryFee: r.delivery_fee,
    tip: r.tip,
    total: r.total,
    items: [...r.order_items].sort((a, b) => a.sort - b.sort).map((i) => `${i.quantity}× ${i.name_snapshot}`),
  }
}

export async function listOrders(
  filters: OrderFilters,
  page: number,
): Promise<{ rows: AdminOrderRow[]; total: number }> {
  const { data, count, error } = await query(filters).range(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE - 1,
  )
  if (error) throw new Error(error.message)
  return { rows: data.map(toRow), total: count ?? 0 }
}

export async function exportOrders(
  filters: OrderFilters,
): Promise<{ rows: AdminOrderRow[]; truncated: boolean }> {
  const { data, count, error } = await query(filters).range(0, EXPORT_LIMIT - 1)
  if (error) throw new Error(error.message)
  return { rows: data.map(toRow), truncated: (count ?? 0) > EXPORT_LIMIT }
}

// One literal on purpose (see above).
const DETAIL_COLUMNS =
  'id, code, business_date, public_token, status, type, customer_name, customer_phone, delivery_street, delivery_number, delivery_floor_apt, delivery_references, scheduled_for, subtotal, delivery_fee, discount, tip, total, payment_method, payment_status, cash_paid_with, paid_at, cancel_reason, estimated_minutes, created_at, tables(number), delivery_zones(name), order_items(id, name_snapshot, quantity, unit_price_snapshot, line_total, note, sort, order_item_modifiers(name_snapshot, price_delta_snapshot)), order_status_history(id, from_status, to_status, reason, created_at)'

export async function fetchOrderDetail(id: string) {
  const { data, error } = await staffClient().from('orders').select(DETAIL_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof fetchOrderDetail>>>

export async function moveOrder(id: string, to: OrderStatus, reason?: string): Promise<void> {
  const { error } = await staffClient().rpc('transition_order', {
    p_order_id: id,
    p_to: to,
    ...(reason ? { p_reason: reason } : {}),
  })
  if (error) throw new Error(error.message)
}

export async function markPaid(id: string): Promise<void> {
  const { error } = await staffClient().rpc('mark_order_paid', { p_order_id: id })
  if (error) throw new Error(error.message)
}
