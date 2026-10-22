import { formatArPhone } from '@/lib/phone'
import type { BadgeTone } from '@/components/ui/Badge'
import type { OrderStatus, OrderType } from '@/lib/orderStatus'
import type { Cell } from './csv'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Esperando pago',
  received: 'Recibido',
  preparing: 'En preparación',
  ready: 'Listo',
  out_for_delivery: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const TYPE_LABEL: Record<OrderType, string> = {
  pickup: 'Retiro',
  delivery: 'Delivery',
  dine_in: 'Mesa',
}
export const METHOD_LABEL = {
  mercado_pago: 'Mercado Pago',
  cash: 'Efectivo',
  transfer: 'Transferencia',
} as const
export const PAYMENT_STATUS_LABEL = {
  pending: 'Pendiente',
  paid: 'Pagado',
  failed: 'Fallido',
  refunded: 'Reembolsado',
} as const

export const statusTone = (s: OrderStatus): BadgeTone =>
  s === 'cancelled'
    ? 'spicy'
    : s === 'delivered'
      ? 'veggie'
      : s === 'pending_payment'
        ? 'muted'
        : s === 'received'
          ? 'promo'
          : 'neutral'

export interface AdminOrderRow {
  id: string
  code: string
  businessDate: string
  createdAt: string
  status: OrderStatus
  type: OrderType
  customerName: string
  customerPhone: string
  address: string
  paymentMethod: keyof typeof METHOD_LABEL
  paymentStatus: keyof typeof PAYMENT_STATUS_LABEL
  subtotal: number
  discount: number
  deliveryFee: number
  tip: number
  total: number
  items: string[]
}

/**
 * The term goes into a PostgREST `or(...)` filter, where `,` `(` `)` and `*` have meaning and `%` `_` are wildcards;
 * everything but letters, digits, spaces and a few name/phone characters is dropped.
 */
export function safeSearch(term: string): string {
  return term
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} +.'-]/gu, '')
    .trim()
    .slice(0, 40)
}

const when = (iso: string, tz: string): string =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(iso))
    .replace(',', '')

export const CSV_HEADER: readonly string[] = [
  'Código',
  'Fecha',
  'Día de negocio',
  'Estado',
  'Tipo',
  'Cliente',
  'Teléfono',
  'Dirección',
  'Productos',
  'Subtotal',
  'Descuento',
  'Envío',
  'Propina',
  'Total',
  'Medio de pago',
  'Estado del pago',
]

/** Rows for the export: one per order, products on a single cell, amounts as plain integers (pesos). */
export function ordersToCsvRows(orders: readonly AdminOrderRow[], tz: string): Cell[][] {
  return [
    [...CSV_HEADER],
    ...orders.map((o) => [
      o.code,
      when(o.createdAt, tz),
      o.businessDate,
      STATUS_LABEL[o.status],
      TYPE_LABEL[o.type],
      o.customerName,
      formatArPhone(o.customerPhone), // no leading "+": spreadsheets would read it as a formula
      o.address,
      o.items.join(' | '),
      o.subtotal,
      o.discount,
      o.deliveryFee,
      o.tip,
      o.total,
      METHOD_LABEL[o.paymentMethod],
      PAYMENT_STATUS_LABEL[o.paymentStatus],
    ]),
  ]
}
