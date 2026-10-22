// Contracts of the Edge Functions (docs/API.md). JSON is snake_case, money is whole ARS pesos.
import type { OrderStatus, OrderType } from '@/lib/orderStatus'

export type PaymentMethod = 'mercado_pago' | 'cash' | 'transfer'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface CartLineInput {
  product_id: string
  quantity: number
  modifier_ids: string[]
  note?: string
}

export interface OrderInput {
  items: CartLineInput[]
  type: OrderType
  coupon_code?: string
  delivery?: { zone_id: string; street: string; number: string; floor_apt?: string; references?: string }
  table_number?: number
  schedule: { mode: 'asap' } | { mode: 'scheduled'; at: string }
  tip?: number
}

export interface QuoteDto {
  lines: {
    product_id: string
    name: string
    unit_total: number
    quantity: number
    line_total: number
    modifiers: { modifier_id: string; name: string; price_delta: number }[]
  }[]
  subtotal: number
  discount: number
  coupon: { code: string | null; kind: 'percent' | 'fixed' | 'two_for_one'; label: string } | null
  delivery_fee: number
  tip: number
  total: number
  estimated_minutes: number | null
  store: { open: boolean; paused: boolean; next_open_at: string | null }
  warnings: { code: string; product_id?: string; details?: unknown }[]
}

export interface CreateOrderRequest extends OrderInput {
  idempotency_key: string
  customer: { name: string; phone: string }
  payment: { method: PaymentMethod; cash_paid_with?: number }
  website?: string
  turnstile_token?: string
}

export interface CreateOrderResponse {
  order: {
    id: string
    code: string
    public_token: string
    status: OrderStatus
    payment_status: PaymentStatus
    total: number
    estimated_minutes: number | null
  }
  next: { action: 'track' } | { action: 'pay_mercado_pago' }
  replayed: boolean
}

export interface PublicOrder {
  code: string
  status: OrderStatus
  type: OrderType
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  created_at: string
  scheduled_for: string | null
  estimated_minutes: number | null
  items: { name: string; quantity: number; modifiers: string[]; note: string | null; line_total: number }[]
  subtotal: number
  discount: number
  delivery_fee: number
  tip: number
  total: number
  table_number: number | null
  history: { status: OrderStatus; at: string }[]
  store: { name: string; whatsapp: string }
  transfer?: { alias: string; cbu: string; holder: string }
}

export interface MpPreferenceResponse {
  init_point: string
  preference_id: string
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_SIGNATURE'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ITEM_UNAVAILABLE'
  | 'IDEMPOTENCY_IN_FLIGHT'
  | 'STORE_CLOSED'
  | 'STORE_PAUSED'
  | 'ORDER_NOT_PAYABLE'
  | 'VALIDATION_ERROR'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'BELOW_MIN_ORDER'
  | 'INVALID_COUPON'
  | 'INVALID_SLOT'
  | 'INVALID_MODIFIERS'
  | 'INVALID_TABLE'
  | 'INVALID_CASH'
  | 'PAYMENT_METHOD_DISABLED'
  | 'RATE_LIMITED'
  | 'MP_UNAVAILABLE'
  | 'INTERNAL'
  | 'NETWORK'
