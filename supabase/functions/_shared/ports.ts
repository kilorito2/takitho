// Ports (hexagonal): handlers depend on these interfaces, never on Supabase directly.
// supabase-repo.ts implements them for production; tests use in-memory fakes.
import type { OpeningShift } from './hours.ts'
import type { OrderStatus, OrderType } from './orderStatus.ts'
import type { PricingCoupon, PricingProduct, PricingZone } from './pricing.ts'

export type PaymentMethod = 'mercado_pago' | 'cash' | 'transfer'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

export interface StoreSettings {
  name: string
  whatsapp: string
  prepMinutes: number
  isPaused: boolean
  isClosedManually: boolean
  acceptsScheduledWhenClosed: boolean
  maxScheduleDays: number
  payMpEnabled: boolean
  payCashEnabled: boolean
  payTransferEnabled: boolean
  timezone: string
  transferAlias: string
  transferCbu: string
  transferHolder: string
  pendingPaymentTtlMin: number
}

export type CouponRecord = PricingCoupon & { id: string }

export interface OrderTxItem {
  product_id: string
  name: string
  unit_price: number
  quantity: number
  line_total: number
  note: string | null
  modifiers: { modifier_id: string; name: string; price_delta: number }[]
}

/** Payload of public.create_order_tx (see migration business_functions). */
export interface OrderTxPayload {
  idempotency_key: string
  request_hash: string
  business_date: string
  initial_status: 'received' | 'pending_payment'
  type: OrderType
  customer: { name: string; phone: string }
  delivery: { street?: string; number?: string; floor_apt?: string | null; references?: string | null }
  zone_id: string | null
  table_id: string | null
  scheduled_for: string | null
  totals: { subtotal: number; delivery_fee: number; discount: number; tip: number; total: number }
  coupon_id: string | null
  payment: { method: PaymentMethod; cash_paid_with: number | null }
  estimated_minutes: number | null
  client_ip_hash: string
  items: OrderTxItem[]
}

export interface CreatedOrder {
  id: string
  code: string
  public_token: string
  status: OrderStatus
  payment_status: PaymentStatus
  total: number
  estimated_minutes: number | null
  replayed: boolean
}

export interface ExistingOrder extends CreatedOrder {
  request_hash: string
}

export interface StoredOrder {
  id: string
  code: string
  status: OrderStatus
  type: OrderType
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  subtotal: number
  discount: number
  deliveryFee: number
  tip: number
  total: number
  createdAt: string
  scheduledFor: string | null
  estimatedMinutes: number | null
  tableNumber: number | null
  mpPreferenceId: string | null
  items: { name: string; quantity: number; modifiers: string[]; note: string | null; lineTotal: number }[]
  history: { status: OrderStatus; at: string }[]
}

export interface PaymentResultArgs {
  orderId: string
  mpPaymentId: string
  mpStatus: string
  amount: number
  currency: string
  raw: unknown
}

export type StaffRole = 'admin' | 'kitchen'

/** Thrown by the repo for business errors raised inside SQL functions (message = SQL error code). */
export class RepoError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.name = 'RepoError'
    this.code = code
  }
}

export interface Repo {
  loadSettings(): Promise<StoreSettings>
  loadHours(): Promise<OpeningShift[]>
  loadProducts(ids: readonly string[]): Promise<PricingProduct[]>
  loadZone(id: string): Promise<PricingZone | null>
  loadTableByNumber(number: number): Promise<{ id: string } | null>
  findCouponByCode(code: string, phone: string): Promise<CouponRecord | null>
  listAutoCoupons(phone: string): Promise<CouponRecord[]>
  findOrderByKey(key: string): Promise<ExistingOrder | null>
  checkRateLimit(key: string, max: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>
  createOrderTx(payload: OrderTxPayload): Promise<CreatedOrder>
  getOrderByToken(token: string): Promise<StoredOrder | null>
  setPreferenceId(orderId: string, preferenceId: string): Promise<void>
  applyPaymentResult(args: PaymentResultArgs): Promise<{ result: string }>
  /** Validates a staff JWT against Auth and returns the staff profile, or null. */
  authenticateStaff(jwt: string): Promise<{ userId: string; role: StaffRole } | null>
  inviteStaff(args: { email: string; role: StaffRole; fullName: string | null; redirectTo: string }): Promise<{ userId: string }>
}

export interface FunctionConfig {
  allowedOrigins: readonly string[]
  /** Public URL of the web app (back_urls, invite redirects). */
  siteUrl: string
  /** Public URL of the functions host, for the Mercado Pago notification_url. */
  functionsUrl: string
  ipHashSalt: string
  /** Optional Cloudflare Turnstile secret; when set, create-order requires a valid token. */
  turnstileSecret: string | null
  mp: { accessToken: string; webhookSecret: string; env: 'sandbox' | 'production'; apiBase: string } | null
  cloudinary: { cloudName: string; apiKey: string; apiSecret: string } | null
  limits: { createIp: number; createPhone: number; quoteIp: number; getOrderIp: number; windowSeconds: number }
}

export interface Deps {
  repo: Repo
  config: FunctionConfig
  now: () => Date
  fetch: typeof fetch
  log: (message: string, detail?: unknown) => void
}
