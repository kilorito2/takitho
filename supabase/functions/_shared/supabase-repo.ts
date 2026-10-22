// Production implementation of the Repo port on top of supabase-js (service role).
// Row shapes are declared locally so each function bundle stays self-contained.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpeningShift } from './hours.ts'
import type { OrderStatus, OrderType } from './orderStatus.ts'
import type { PricingGroup, PricingProduct, PricingZone } from './pricing.ts'
import {
  RepoError,
  type CouponRecord,
  type CreatedOrder,
  type ExistingOrder,
  type OrderTxPayload,
  type PaymentMethod,
  type PaymentResultArgs,
  type PaymentStatus,
  type Repo,
  type StaffRole,
  type StoreSettings,
  type StoredOrder,
} from './ports.ts'

const KNOWN_SQL_ERRORS = new Set([
  'IDEMPOTENCY_KEY_REUSED',
  'COUPON_EXHAUSTED',
  'COUPON_PHONE_EXHAUSTED',
  'INVALID_TRANSITION',
  'ORDER_NOT_FOUND',
])

/** Business errors raised in SQL arrive as the error message; anything else is a real failure. */
function raise(error: { message: string }): never {
  if (KNOWN_SQL_ERRORS.has(error.message)) throw new RepoError(error.message)
  throw new Error(`database error: ${error.message}`)
}

const asRows = <T>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : [])

export function createSupabaseRepo(db: SupabaseClient): Repo {
  async function usesByPhone(couponId: string, phone: string): Promise<number> {
    if (!phone) return 0
    const { count, error } = await db
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId)
      .eq('phone', phone)
    if (error) raise(error)
    return count ?? 0
  }

  interface CouponRow {
    id: string
    code: string | null
    label: string
    kind: 'percent' | 'fixed' | 'two_for_one'
    value: number
    scope: 'all' | 'category' | 'products'
    scope_ids: string[]
    weekdays: number[]
    starts_at: string | null
    ends_at: string | null
    max_uses: number | null
    uses_count: number
    max_uses_per_phone: number | null
    min_purchase: number
    is_active: boolean
  }
  const toCoupon = async (row: CouponRow, phone: string): Promise<CouponRecord> => ({
    id: row.id,
    code: row.code,
    label: row.label,
    kind: row.kind,
    value: row.value,
    scope: row.scope,
    scopeIds: row.scope_ids,
    weekdays: row.weekdays,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxUses: row.max_uses,
    usesCount: row.uses_count,
    maxUsesPerPhone: row.max_uses_per_phone,
    usesByPhone: await usesByPhone(row.id, phone),
    minPurchase: row.min_purchase,
    isActive: row.is_active,
  })

  return {
    async loadSettings(): Promise<StoreSettings> {
      const { data, error } = await db.from('store_settings').select('*').eq('id', 1).single()
      if (error) raise(error)
      const s = data as Record<string, unknown>
      return {
        name: String(s.name),
        whatsapp: String(s.whatsapp),
        prepMinutes: Number(s.prep_minutes),
        isPaused: Boolean(s.is_paused),
        isClosedManually: Boolean(s.is_closed_manually),
        acceptsScheduledWhenClosed: Boolean(s.accepts_scheduled_when_closed),
        maxScheduleDays: Number(s.max_schedule_days),
        payMpEnabled: Boolean(s.pay_mp_enabled),
        payCashEnabled: Boolean(s.pay_cash_enabled),
        payTransferEnabled: Boolean(s.pay_transfer_enabled),
        timezone: String(s.timezone),
        transferAlias: String(s.transfer_alias),
        transferCbu: String(s.transfer_cbu),
        transferHolder: String(s.transfer_holder),
        pendingPaymentTtlMin: Number(s.pending_payment_ttl_min),
      }
    },

    async loadHours(): Promise<OpeningShift[]> {
      const { data, error } = await db.from('opening_hours').select('weekday, opens_at, closes_at').eq('is_active', true)
      if (error) raise(error)
      return asRows<{ weekday: number; opens_at: string; closes_at: string }>(data).map((r) => ({
        weekday: r.weekday,
        opensAt: r.opens_at,
        closesAt: r.closes_at,
      }))
    },

    async loadProducts(ids): Promise<PricingProduct[]> {
      const { data, error } = await db
        .from('products')
        .select(
          'id, name, price, category_id, is_available, is_active, product_modifier_groups(sort, modifier_groups(id, name, min_select, max_select, is_required, is_active, modifiers(id, name, price_delta, is_available, is_active, sort)))',
        )
        .in('id', [...ids])
      if (error) raise(error)
      interface Row {
        id: string
        name: string
        price: number
        category_id: string | null
        is_available: boolean
        is_active: boolean
        product_modifier_groups: {
          sort: number
          modifier_groups: {
            id: string
            name: string
            min_select: number
            max_select: number
            is_required: boolean
            is_active: boolean
            modifiers: { id: string; name: string; price_delta: number; is_available: boolean; is_active: boolean; sort: number }[]
          } | null
        }[]
      }
      return asRows<Row>(data)
        .filter((p) => p.is_active) // an inactive product behaves as if it did not exist
        .map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          categoryId: p.category_id,
          isAvailable: p.is_available,
          groups: [...p.product_modifier_groups]
            .sort((a, b) => a.sort - b.sort)
            .flatMap((link): PricingGroup[] => {
              const g = link.modifier_groups
              if (!g?.is_active) return []
              return [
                {
                  id: g.id,
                  name: g.name,
                  minSelect: g.min_select,
                  maxSelect: g.max_select,
                  isRequired: g.is_required,
                  modifiers: [...g.modifiers]
                    .filter((m) => m.is_active)
                    .sort((a, b) => a.sort - b.sort)
                    .map((m) => ({ id: m.id, name: m.name, priceDelta: m.price_delta, isAvailable: m.is_available })),
                },
              ]
            }),
        }))
    },

    async loadZone(id): Promise<PricingZone | null> {
      const { data, error } = await db.from('delivery_zones').select('id, fee, min_order').eq('id', id).eq('is_active', true).maybeSingle()
      if (error) raise(error)
      const z = data as { id: string; fee: number; min_order: number } | null
      return z ? { id: z.id, fee: z.fee, minOrder: z.min_order } : null
    },

    async loadTableByNumber(number) {
      const { data, error } = await db.from('tables').select('id').eq('number', number).eq('is_active', true).maybeSingle()
      if (error) raise(error)
      return (data as { id: string } | null) ?? null
    },

    async findCouponByCode(code, phone) {
      // Codes are stored upper-case (CHECK constraint), so an exact match is enough and avoids LIKE wildcards.
      const { data, error } = await db.from('coupons').select('*').eq('code', code.trim().toUpperCase()).maybeSingle()
      if (error) raise(error)
      return data ? toCoupon(data as CouponRow, phone) : null
    },

    async listAutoCoupons(phone) {
      const { data, error } = await db.from('coupons').select('*').eq('auto_apply', true).eq('is_active', true)
      if (error) raise(error)
      return Promise.all(asRows<CouponRow>(data).map((row) => toCoupon(row, phone)))
    },

    async findOrderByKey(key): Promise<ExistingOrder | null> {
      const { data, error } = await db
        .from('orders')
        .select('id, code, public_token, status, payment_status, total, estimated_minutes, request_hash')
        .eq('idempotency_key', key)
        .maybeSingle()
      if (error) raise(error)
      const o = data as {
        id: string
        code: string
        public_token: string
        status: OrderStatus
        payment_status: PaymentStatus
        total: number
        estimated_minutes: number | null
        request_hash: string
      } | null
      return o ? { ...o, replayed: true } : null
    },

    async checkRateLimit(key, max, windowSeconds) {
      const { data, error } = await db.rpc('check_rate_limit', { p_key: key, p_max: max, p_window_s: windowSeconds })
      if (error) raise(error)
      const r = data as { allowed: boolean; retry_after_s: number }
      return { allowed: r.allowed, retryAfterSeconds: r.retry_after_s }
    },

    async createOrderTx(payload: OrderTxPayload): Promise<CreatedOrder> {
      const { data, error } = await db.rpc('create_order_tx', { p: payload })
      if (error) raise(error)
      return data as CreatedOrder
    },

    async getOrderByToken(token): Promise<StoredOrder | null> {
      const { data, error } = await db
        .from('orders')
        .select(
          'id, code, status, type, payment_method, payment_status, subtotal, discount, delivery_fee, tip, total, created_at, scheduled_for, estimated_minutes, mp_preference_id, tables(number), order_items(name_snapshot, quantity, note, line_total, sort, order_item_modifiers(name_snapshot)), order_status_history(to_status, created_at, id)',
        )
        .eq('public_token', token)
        .maybeSingle()
      if (error) raise(error)
      if (!data) return null
      const o = data as unknown as {
        id: string
        code: string
        status: OrderStatus
        type: OrderType
        payment_method: PaymentMethod
        payment_status: PaymentStatus
        subtotal: number
        discount: number
        delivery_fee: number
        tip: number
        total: number
        created_at: string
        scheduled_for: string | null
        estimated_minutes: number | null
        mp_preference_id: string | null
        tables: { number: number } | null
        order_items: { name_snapshot: string; quantity: number; note: string | null; line_total: number; sort: number; order_item_modifiers: { name_snapshot: string }[] }[]
        order_status_history: { to_status: OrderStatus; created_at: string; id: number }[]
      }
      return {
        id: o.id,
        code: o.code,
        status: o.status,
        type: o.type,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        subtotal: o.subtotal,
        discount: o.discount,
        deliveryFee: o.delivery_fee,
        tip: o.tip,
        total: o.total,
        createdAt: o.created_at,
        scheduledFor: o.scheduled_for,
        estimatedMinutes: o.estimated_minutes,
        tableNumber: o.tables?.number ?? null,
        mpPreferenceId: o.mp_preference_id,
        items: [...o.order_items]
          .sort((a, b) => a.sort - b.sort)
          .map((i) => ({ name: i.name_snapshot, quantity: i.quantity, modifiers: i.order_item_modifiers.map((m) => m.name_snapshot), note: i.note, lineTotal: i.line_total })),
        history: [...o.order_status_history].sort((a, b) => a.id - b.id).map((h) => ({ status: h.to_status, at: h.created_at })),
      }
    },

    async setPreferenceId(orderId, preferenceId) {
      const { error } = await db.from('orders').update({ mp_preference_id: preferenceId }).eq('id', orderId)
      if (error) raise(error)
    },

    async applyPaymentResult(args: PaymentResultArgs) {
      const { data, error } = await db.rpc('apply_payment_result', {
        p_order_id: args.orderId,
        p_mp_payment_id: args.mpPaymentId,
        p_mp_status: args.mpStatus,
        p_amount: args.amount,
        p_currency: args.currency,
        p_raw: args.raw,
      })
      if (error) raise(error)
      return data as { result: string }
    },

    async authenticateStaff(jwt) {
      const { data: auth, error } = await db.auth.getUser(jwt)
      if (error || !auth.user) return null
      const { data, error: profileError } = await db.from('profiles').select('role, is_active').eq('id', auth.user.id).maybeSingle()
      if (profileError) raise(profileError)
      const p = data as { role: StaffRole; is_active: boolean } | null
      return p?.is_active ? { userId: auth.user.id, role: p.role } : null
    },

    async inviteStaff({ email, role, fullName, redirectTo }) {
      const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: fullName ?? '' } })
      if (error || !data.user) {
        if (error?.message.toLowerCase().includes('already')) throw new RepoError('USER_EXISTS')
        throw new Error(`invite failed: ${error?.message ?? 'unknown'}`)
      }
      // Authorization data lives in `profiles` (never in user_metadata, which users can edit).
      const { error: upsertError } = await db.from('profiles').upsert({ id: data.user.id, email, full_name: fullName ?? '', role, is_active: true })
      if (upsertError) raise(upsertError)
      return { userId: data.user.id }
    },
  }
}
