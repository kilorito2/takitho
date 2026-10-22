// Single error contract for every function (docs/API.md §1).
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

export const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_SIGNATURE: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ITEM_UNAVAILABLE: 409,
  IDEMPOTENCY_IN_FLIGHT: 409,
  STORE_CLOSED: 409,
  STORE_PAUSED: 409,
  ORDER_NOT_PAYABLE: 409,
  VALIDATION_ERROR: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  BELOW_MIN_ORDER: 422,
  INVALID_COUPON: 422,
  INVALID_SLOT: 422,
  INVALID_MODIFIERS: 422,
  INVALID_TABLE: 422,
  INVALID_CASH: 422,
  PAYMENT_METHOD_DISABLED: 422,
  RATE_LIMITED: 429,
  MP_UNAVAILABLE: 502,
  INTERNAL: 500,
}

export class HttpError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: unknown

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.code = code
    this.status = STATUS_BY_CODE[code]
    this.details = details
  }
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown }
}
