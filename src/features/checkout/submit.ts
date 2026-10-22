import { ApiError, type ApiClient } from '@/lib/api'
import type { ApiErrorCode, CreateOrderRequest, CreateOrderResponse, MpPreferenceResponse } from '@/types/api'
import { buildOrderInput, type OrderShape } from '@/features/cart/quote'
import type { CartItem } from '@/features/cart/store'
import { parseAmount } from './money'
import type { CheckoutValues } from './schema'

/** Index of the checkout step where the customer can fix the problem, or null when it is not a step problem. */
const STEP_FOR_ERROR: Partial<Record<ApiErrorCode, number>> = {
  INVALID_TABLE: 0,
  BELOW_MIN_ORDER: 0,
  INVALID_SLOT: 1,
  STORE_CLOSED: 1,
  STORE_PAUSED: 1,
  VALIDATION_ERROR: 2,
  INVALID_CASH: 3,
  PAYMENT_METHOD_DISABLED: 3,
}

export const stepForError = (code: ApiErrorCode): number | null => STEP_FOR_ERROR[code] ?? null

export interface OrderContext {
  items: readonly CartItem[]
  values: CheckoutValues
  couponCode: string | null
  tableNumber: number | null
  /** Tip in whole pesos, already resolved from the percentage/custom choice. */
  tip: number
  turnstileToken?: string | undefined
}

export function orderShape(c: OrderContext): OrderShape {
  const { values: v } = c
  return {
    type: v.type,
    zoneId: v.type === 'delivery' ? v.zoneId : null,
    address:
      v.type === 'delivery'
        ? { street: v.street, number: v.number, floorApt: v.floorApt, references: v.references }
        : null,
    tableNumber: v.type === 'dine_in' ? c.tableNumber : null,
    scheduledAt: v.whenMode === 'scheduled' && v.slot ? v.slot : null,
    tip: c.tip,
    couponCode: c.couponCode,
  }
}

/** The `create-order` body. Only ids, quantities, notes and the customer's choices: never a price. */
export function buildCreateRequest(c: OrderContext, idempotencyKey: string): CreateOrderRequest {
  const { values: v } = c
  const cash = v.method === 'cash' && v.cashPaidWith.trim() !== '' ? parseAmount(v.cashPaidWith) : null
  return {
    ...buildOrderInput(c.items, orderShape(c)),
    idempotency_key: idempotencyKey,
    customer: { name: v.name.trim(), phone: v.phone.trim() },
    payment: { method: v.method, ...(cash !== null ? { cash_paid_with: cash } : {}) },
    ...(v.website ? { website: v.website } : {}),
    ...(c.turnstileToken ? { turnstile_token: c.turnstileToken } : {}),
  }
}

export type SubmitResult =
  | { kind: 'redirect'; url: string; order: CreateOrderResponse['order'] }
  /** Order created; go to its tracking page. `paymentError` is set when Mercado Pago could not be opened. */
  | { kind: 'tracked'; order: CreateOrderResponse['order']; paymentError: ApiError | null }
  | { kind: 'error'; error: ApiError; step: number | null }

export async function submitOrder(api: ApiClient, request: CreateOrderRequest): Promise<SubmitResult> {
  let created: CreateOrderResponse
  try {
    created = await api.call<CreateOrderResponse>('create-order', request)
  } catch (error) {
    if (error instanceof ApiError) return { kind: 'error', error, step: stepForError(error.code) }
    throw error
  }
  if (created.next.action !== 'pay_mercado_pago')
    return { kind: 'tracked', order: created.order, paymentError: null }
  try {
    const pref = await api.call<MpPreferenceResponse>('create-mp-preference', {
      order_code: created.order.code,
      public_token: created.order.public_token,
    })
    return { kind: 'redirect', url: pref.init_point, order: created.order }
  } catch (error) {
    // The order exists (pending payment): the tracking page offers "Reintentar el pago".
    if (error instanceof ApiError) return { kind: 'tracked', order: created.order, paymentError: error }
    throw error
  }
}
