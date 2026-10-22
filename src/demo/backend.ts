// A stand-in for Supabase for browser tests: REST rows from the real seed, the REAL Edge Function handlers
// (supabase/functions/_shared) over an in-memory repo, and a minimal Phoenix websocket for Realtime.
// Lets the full customer/kitchen flows run in CI without a cloud project; the same flows can be pointed at a real
// dev project by setting E2E_REAL_BACKEND (see tests/e2e/README in docs/).

/** The slice of Playwright's `Route` the backend needs: the browser demo implements the same shape over `fetch`. */
export interface BackendRoute {
  request(): { method(): string; url(): string; headers(): Record<string, string>; postData(): string | null }
  fulfill(response: {
    status: number
    headers?: Record<string, string>
    json?: unknown
    body?: string
  }): Promise<void> | void
}

/** The slice of Playwright's `BackendSocket` the backend needs (a Phoenix-protocol socket). */
export interface BackendSocket {
  send(data: string): void
  onMessage(handler: (message: string) => void): void
  onClose(handler: () => void): void
}
import * as seed from '../../scripts/seed-data.ts'
import { hmacSha256Hex } from '../../supabase/functions/_shared/crypto.ts'
import { handleCloudinarySign, handleInviteStaff } from '../../supabase/functions/_shared/handlers/staff.ts'
import {
  handleCreateMpPreference,
  handleMpWebhook,
} from '../../supabase/functions/_shared/handlers/payments.ts'
import {
  handleCreateOrder,
  handleGetOrder,
  handleQuoteOrder,
} from '../../supabase/functions/_shared/handlers/orders.ts'
import { withHttp } from '../../supabase/functions/_shared/http.ts'
import { canTransition, nextStatus, type OrderStatus } from '../../supabase/functions/_shared/orderStatus.ts'
import type { Deps, StoredOrder } from '../../supabase/functions/_shared/ports.ts'
import type { PricingProduct } from '../../supabase/functions/_shared/pricing.ts'
import {
  baseConfig,
  makeRepo,
  makeState,
  type defaultSettings,
  type FakeState,
} from '../../tests/functions/testkit.ts'

const uid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const catId = Object.fromEntries(seed.categories.map((c, i) => [c.key, uid('c', i + 1)]))
const groupId = Object.fromEntries(seed.groups.map((g, i) => [g.key, uid('b', i + 1)]))
const productId = Object.fromEntries(seed.products.map((p, i) => [p.name, uid('a', i + 1)]))

export const SITE = 'http://localhost:5173'
const ORIGINS = ['http://localhost:5173', 'http://localhost:4173']
/** Tuesday 21:00 in Buenos Aires: inside the seed's 19:00–01:00 shift (the seed opens Tuesday to Sunday). */
export const OPEN_AT = new Date('2026-10-20T21:00:00-03:00')
export const CLOSED_AT = new Date('2026-10-20T12:00:00-03:00')

interface ModifierRow {
  id: string
  name: string
  price_delta: number
  is_available: boolean
  sort: number
}
interface GroupRow {
  id: string
  name: string
  min_select: number
  max_select: number
  is_required: boolean
  modifiers: ModifierRow[]
}

function buildRows() {
  let m = 0
  const groups: GroupRow[] = seed.groups.map((g, i) => ({
    id: groupId[g.key] ?? '',
    name: g.name,
    min_select: g.min,
    max_select: g.max,
    is_required: g.required,
    modifiers: g.options.map(([name, delta], j) => ({
      id: uid('d', ++m),
      name,
      price_delta: delta,
      is_available: true,
      is_active: true,
      sort: j + 1,
    })),
    sort: i + 1,
    is_active: true,
  }))
  const products = seed.products.map((p, i) => ({
    id: productId[p.name] ?? '',
    category_id: catId[p.cat] ?? null,
    type: p.type ?? 'single',
    name: p.name,
    slug: p.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
    description: p.desc,
    unit_label: p.unit,
    price: p.price,
    image_public_id: `${seed.CLOUDINARY_FOLDER}/${p.image}`,
    spicy_level: p.spicy,
    tags: p.tags,
    is_available: true,
    is_active: true,
    sort: i + 1,
  }))
  return {
    categories: seed.categories.map((c, i) => ({
      id: catId[c.key],
      name: c.name,
      slug: c.key,
      description: c.description,
      sort: i + 1,
      is_active: true,
    })),
    products,
    modifier_groups: groups,
    product_modifier_groups: seed.products.flatMap((p) =>
      p.groups.map((g, j) => ({ product_id: productId[p.name], group_id: groupId[g], sort: j + 1 })),
    ),
    combo_items: seed.products.flatMap((p) =>
      (p.combo ?? []).map(([n, qty]) => ({
        combo_id: productId[p.name],
        product_id: productId[n],
        quantity: qty,
      })),
    ),
    opening_hours: seed.openingHours.map(([weekday, o, c]) => ({
      weekday,
      opens_at: `${o}:00`,
      closes_at: `${c}:00`,
    })),
    delivery_zones: seed.zones.map((z, i) => ({
      id: uid('e', i + 1),
      name: z.name,
      neighborhoods: z.neighborhoods,
      fee: z.fee,
      min_order: z.minOrder,
      sort: i + 1,
      is_active: true,
    })),
    coupons: seed.coupons
      .map((c, i) => ({
        id: uid('9', i + 1),
        label: c.label,
        kind: c.kind,
        value: c.value,
        weekdays: c.weekdays,
        min_purchase: 0,
        auto_apply: c.autoApply,
        scope: c.scope,
        scope_ids: c.scopeCat ? [catId[c.scopeCat]] : [],
      }))
      .filter((c) => c.auto_apply),
    tables: seed.tables.map((n, i) => ({ id: uid('f', i + 1), number: n, label: '', is_active: true })),
  }
}

export type Rows = ReturnType<typeof buildRows>

const storeRow = (s: ReturnType<typeof defaultSettings>) => ({
  name: s.name,
  tagline: 'Tacos de barrio',
  address: 'Av. Siempreviva 742',
  maps_url: '[COMPLETAR]',
  whatsapp: '5491155550000',
  instagram: 'takitho.tacos',
  facebook: '[COMPLETAR]',
  tiktok: '[COMPLETAR]',
  prep_minutes: s.prepMinutes,
  is_paused: s.isPaused,
  is_closed_manually: s.isClosedManually,
  accepts_scheduled_when_closed: s.acceptsScheduledWhenClosed,
  max_schedule_days: s.maxScheduleDays,
  pay_mp_enabled: s.payMpEnabled,
  pay_cash_enabled: s.payCashEnabled,
  pay_transfer_enabled: s.payTransferEnabled,
  tip_presets: [0, 5, 10],
  timezone: s.timezone,
  timer_warn_minutes: 10,
  timer_late_minutes: 20,
  transfer_alias: 'takitho.tacos',
  transfer_cbu: '0000003100012345678901',
  transfer_holder: 'Takitho SRL',
  pending_payment_ttl_min: 30,
  public_url: 'https://takitho.test',
})

export class DemoBackend {
  readonly rows = buildRows()
  readonly state: FakeState
  now = OPEN_AT
  /** Joined realtime topics → sockets, so tests can push broadcasts. */
  private sockets = new Set<BackendSocket>()
  private joined = new Map<
    BackendSocket,
    Map<string, { id: number; event: string; schema: string; table: string }[]>
  >()
  private bindingId = 0
  mpPayments = new Map<
    string,
    {
      id: number
      status: string
      external_reference: string
      transaction_amount: number
      currency_id: string
    }
  >()
  readonly mpWebhookSecret = 'whsec_e2e'
  /** Moment each online payment was approved (the kitchen timer starts there). */
  private paidAt = new Map<string, string>()
  private cancelReasons = new Map<string, string>()
  /** The one staff account of the mock Auth server. Fake values: they only exist inside this test double. */
  readonly staff = {
    id: uid('5', 1),
    email: 'cocina@takitho.test',
    password: 'clave-de-prueba-1',
    name: 'Cocina',
    role: 'kitchen' as 'kitchen' | 'admin',
    active: true,
  }

  constructor(over: Partial<FakeState> = {}) {
    const pricing = this.pricingProducts()
    this.state = makeState({
      products: pricing,
      shifts: seed.openingHours.map(([weekday, opensAt, closesAt]) => ({ weekday, opensAt, closesAt })),
      zones: this.rows.delivery_zones.map((z) => ({ id: z.id, fee: z.fee, minOrder: z.min_order })),
      tables: Object.fromEntries(this.rows.tables.map((t) => [t.number, { id: t.id }])),
      coupons: seed.coupons.map((c, i) => ({
        id: uid('9', i + 1),
        code: c.code,
        label: c.label,
        kind: c.kind,
        value: c.value,
        scope: c.scope,
        scopeIds: c.scopeCat ? [catId[c.scopeCat] ?? ''] : [],
        weekdays: c.weekdays,
        startsAt: null,
        endsAt: null,
        maxUses: null,
        usesCount: 0,
        maxUsesPerPhone: c.maxPerPhone ?? null,
        usesByPhone: 0,
        minPurchase: 0,
        isActive: true,
      })),
      ...over,
    })
  }

  private pricingProducts(): PricingProduct[] {
    const groupById = new Map(this.rows.modifier_groups.map((g) => [g.id, g]))
    return this.rows.products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      categoryId: p.category_id,
      isAvailable: p.is_available,
      groups: this.rows.product_modifier_groups
        .filter((l) => l.product_id === p.id)
        .flatMap((l) => {
          const g = groupById.get(l.group_id ?? '')
          return g
            ? [
                {
                  id: g.id,
                  name: g.name,
                  minSelect: g.min_select,
                  maxSelect: g.max_select,
                  isRequired: g.is_required,
                  modifiers: g.modifiers.map((x) => ({
                    id: x.id,
                    name: x.name,
                    priceDelta: x.price_delta,
                    isAvailable: x.is_available,
                  })),
                },
              ]
            : []
        }),
    }))
  }

  /* ----------------------------- admin-like mutations used by tests ----------------------------- */

  /** Mark a product sold out / available (like the kitchen "Agotar" button) and push the realtime event. */
  setProductAvailable(name: string, available: boolean): void {
    const row = this.rows.products.find((p) => p.name === name)
    if (!row) throw new Error(`no product ${name}`)
    row.is_available = available
    const live = this.state.products.find((p) => p.id === row.id)
    if (live) live.isAvailable = available
    this.pushChange('products', 'UPDATE', row)
  }

  setPrice(name: string, price: number): void {
    const row = this.rows.products.find((p) => p.name === name)
    if (!row) throw new Error(`no product ${name}`)
    row.price = price
    const live = this.state.products.find((p) => p.id === row.id)
    if (live) live.price = price
    this.pushChange('products', 'UPDATE', row)
  }

  setPaused(paused: boolean): void {
    this.state.settings.isPaused = paused
  }

  /** Move an order along its happy path, like the kitchen does, and broadcast it to the tracking page. */
  advance(code: string): OrderStatus {
    const entry = this.findByCode(code)
    const next = nextStatus(entry.order.status, entry.order.type)
    if (!next) throw new Error(`order ${code} cannot advance from ${entry.order.status}`)
    this.move(entry.token, entry.order, next)
    return next
  }

  private findByCode(code: string): { token: string; order: StoredOrder } {
    const entry = [...this.state.storedByToken.entries()].find(([, o]) => o.code === code)
    if (!entry) throw new Error(`no order ${code}`)
    return { token: entry[0], order: entry[1] }
  }

  /** Applies a status change and tells everybody who listens: the customer (broadcast) and the staff (Postgres Changes). */
  private move(token: string, order: StoredOrder, to: OrderStatus): void {
    order.status = to
    order.history.push({ status: to, at: this.now.toISOString() })
    this.broadcast(`order:${token}`, 'order_update', {
      status: to,
      payment_status: order.paymentStatus,
      estimated_minutes: order.estimatedMinutes,
      at: this.now.toISOString(),
    })
    this.pushChange('orders', 'UPDATE', { id: order.id, code: order.code, status: to })
  }

  /** The `transition_order` RPC: same graph as Postgres, so an invalid step is refused here too. */
  private transition(orderId: string, to: OrderStatus): { ok: true } | { ok: false; message: string } {
    const entry = [...this.state.storedByToken.entries()].find(([, o]) => o.id === orderId)
    if (!entry) return { ok: false, message: 'ORDER_NOT_FOUND' }
    const [token, order] = entry
    if (!canTransition(order.status, to, order.type)) return { ok: false, message: 'INVALID_TRANSITION' }
    if (to === 'cancelled' && this.staff.role !== 'admin') return { ok: false, message: 'FORBIDDEN' }
    this.move(token, order, to)
    return { ok: true }
  }

  /** Orders shaped like the kitchen's PostgREST select (embedded items, modifiers and table). */
  private kitchenRows() {
    return this.state.orders.flatMap((created) => {
      const stored = [...this.state.storedByToken.values()].find((o) => o.id === created.id)
      if (!stored || stored.status === 'cancelled' || stored.status === 'pending_payment') return []
      const p = created.payload
      const table = p.table_id ? this.rows.tables.find((t) => t.id === p.table_id) : undefined
      return [
        {
          id: stored.id,
          code: stored.code,
          status: stored.status,
          type: stored.type,
          customer_name: p.customer.name,
          customer_phone: p.customer.phone,
          delivery_street: p.delivery.street ?? null,
          delivery_number: p.delivery.number ?? null,
          delivery_floor_apt: p.delivery.floor_apt ?? null,
          delivery_references: p.delivery.references ?? null,
          scheduled_for: stored.scheduledFor,
          created_at: stored.createdAt,
          paid_at: this.paidAt.get(stored.id) ?? null,
          payment_method: stored.paymentMethod,
          payment_status: stored.paymentStatus,
          cash_paid_with: p.payment.cash_paid_with,
          total: stored.total,
          tables: table ? { number: table.number } : null,
          order_items: p.items.map((i, n) => ({
            id: `${stored.id}-${n}`,
            name_snapshot: i.name,
            quantity: i.quantity,
            note: i.note,
            sort: n,
            order_item_modifiers: i.modifiers.map((m) => ({ name_snapshot: m.name })),
          })),
        },
      ]
    })
  }

  /** Simulate Mercado Pago approving the payment of an order (signed webhook → real handler). */
  async approvePayment(code: string): Promise<void> {
    const entry = [...this.state.storedByToken.values()].find((o) => o.code === code)
    if (!entry) throw new Error(`no order ${code}`)
    const paymentId = 900000 + this.mpPayments.size + 1
    this.mpPayments.set(String(paymentId), {
      id: paymentId,
      status: 'approved',
      external_reference: entry.id,
      transaction_amount: entry.total,
      currency_id: 'ARS',
    })
    const ts = Math.floor(this.now.getTime() / 1000)
    const requestId = `req-${paymentId}`
    const sig = await hmacSha256Hex(this.mpWebhookSecret, `id:${paymentId};request-id:${requestId};ts:${ts};`)
    const req = new Request(
      `https://p.supabase.co/functions/v1/mp-webhook?data.id=${paymentId}&type=payment`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-signature': `ts=${ts},v1=${sig}`,
          'x-request-id': requestId,
        },
        body: JSON.stringify({ type: 'payment', data: { id: String(paymentId) } }),
      },
    )
    const res = await handleMpWebhook(req, this.deps())
    if (res.status !== 200) throw new Error(`webhook failed: ${res.status}`)
  }

  /* ----------------------------- wiring ----------------------------- */

  deps(): Deps {
    const base = makeRepo(this.state)
    const state = this.state
    const repo: Deps['repo'] = {
      ...base,
      loadSettings: () => Promise.resolve(state.settings),
      createOrderTx: async (payload) => {
        const created = await base.createOrderTx(payload)
        if (!created.replayed) {
          const stored: StoredOrder = {
            id: created.id,
            code: created.code,
            status: created.status,
            type: payload.type,
            paymentMethod: payload.payment.method,
            paymentStatus: 'pending',
            subtotal: payload.totals.subtotal,
            discount: payload.totals.discount,
            deliveryFee: payload.totals.delivery_fee,
            tip: payload.totals.tip,
            total: payload.totals.total,
            createdAt: this.now.toISOString(),
            scheduledFor: payload.scheduled_for,
            estimatedMinutes: payload.estimated_minutes,
            tableNumber: null,
            mpPreferenceId: null,
            items: payload.items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              modifiers: i.modifiers.map((x) => x.name),
              note: i.note,
              lineTotal: i.line_total,
            })),
            history: [{ status: created.status, at: this.now.toISOString() }],
          }
          state.storedByToken.set(created.public_token, stored)
          this.pushChange('orders', 'INSERT', { id: stored.id, code: stored.code, status: stored.status })
        }
        return created
      },
      applyPaymentResult: (args) => {
        const order = [...state.storedByToken.values()].find((o) => o.id === args.orderId)
        if (order && args.mpStatus === 'approved' && args.amount === order.total) {
          order.paymentStatus = 'paid'
          this.paidAt.set(order.id, this.now.toISOString())
          if (order.status === 'pending_payment') order.status = 'received'
          order.history.push({ status: order.status, at: this.now.toISOString() })
          const token = [...state.storedByToken.entries()].find(([, o]) => o === order)?.[0]
          if (token)
            this.broadcast(`order:${token}`, 'order_update', {
              status: order.status,
              payment_status: 'paid',
              estimated_minutes: order.estimatedMinutes,
              at: this.now.toISOString(),
            })
          this.pushChange('orders', 'UPDATE', { id: order.id, code: order.code, status: order.status })
        }
        return Promise.resolve({ result: 'paid' as const })
      },
    }
    const mpFetch: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.endsWith('/checkout/preferences')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'pref-e2e',
              init_point: 'https://mp.test/checkout/pref-e2e',
              sandbox_init_point: 'https://mp.test/checkout/pref-e2e',
            }),
            { status: 201 },
          ),
        )
      }
      const payment = this.mpPayments.get(url.split('/').pop() ?? '')
      return Promise.resolve(
        payment ? new Response(JSON.stringify(payment)) : new Response('{}', { status: 404 }),
      )
    }
    return {
      repo,
      config: baseConfig({
        allowedOrigins: ORIGINS,
        siteUrl: SITE,
        mp: {
          accessToken: 'TEST-e2e',
          webhookSecret: this.mpWebhookSecret,
          env: 'sandbox',
          apiBase: 'https://api.mercadopago.test',
        },
        limits: { createIp: 500, createPhone: 500, quoteIp: 5000, getOrderIp: 5000, windowSeconds: 600 },
      }),
      now: () => this.now,
      fetch: mpFetch,
      log: () => undefined,
    }
  }

  /** PostgREST: reads from the seed / in-memory state; writes are acknowledged (the specs that need them assert on rows). */
  async rest(route: BackendRoute, cors: Record<string, string>): Promise<void> {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop() ?? ''
    if (url.pathname.includes('/rest/v1/rpc/')) return this.rpc(route, table, cors)
    if (request.method() !== 'GET') return route.fulfill({ status: 204, headers: cors })

    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object')
    const rows = this.table(table, url.searchParams)
    if (!rows) return route.fulfill({ status: 404, headers: cors, json: { message: `no table ${table}` } })
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      json: single ? rows[0] : rows,
    })
  }

  /** Rows of a table as PostgREST would answer a GET with these query parameters; null when the table does not exist. */
  table(table: string, params: URLSearchParams): unknown[] | null {
    const select = params.get('select') ?? ''
    switch (table) {
      case 'profiles': {
        const self = {
          id: this.staff.id,
          role: this.staff.role,
          full_name: this.staff.name,
          is_active: this.staff.active,
        }
        return params.has('id') ? [self] : [{ ...self, email: this.staff.email }]
      }
      case 'orders': {
        if (select.includes('order_status_history')) {
          const id = (params.get('id') ?? '').replace('eq.', '')
          return this.adminOrders().filter((o) => o.id === id)
        }
        return select.includes('tables(number)') ? this.kitchenRows() : this.adminOrders()
      }
      case 'store_settings':
        return [storeRow(this.state.settings)]
      case 'admin_alerts':
        return []
      case 'coupons':
        return select.includes('uses_count') ? this.adminCoupons() : this.rows.coupons
      default:
        return (this.rows as Record<string, unknown[] | undefined>)[table] ?? null
    }
  }

  private adminCoupons() {
    return seed.coupons.map((c, i) => ({
      id: uid('9', i + 1),
      code: c.code,
      label: c.label,
      kind: c.kind,
      value: c.value,
      scope: c.scope,
      scope_ids: c.scopeCat ? [catId[c.scopeCat] ?? ''] : [],
      weekdays: c.weekdays,
      starts_at: null,
      ends_at: null,
      max_uses: null,
      uses_count: 0,
      max_uses_per_phone: c.maxPerPhone ?? null,
      min_purchase: 0,
      auto_apply: c.autoApply,
      is_active: true,
    }))
  }

  /** Orders as the admin screens read them (list and detail share one superset). */
  private adminOrders() {
    return this.state.orders.flatMap((created) => {
      const stored = [...this.state.storedByToken.entries()].find(([, o]) => o.id === created.id)
      if (!stored) return []
      const [token, o] = stored
      const p = created.payload
      const table = p.table_id ? this.rows.tables.find((t) => t.id === p.table_id) : undefined
      return [
        {
          id: o.id,
          code: o.code,
          business_date: p.business_date,
          public_token: token,
          created_at: o.createdAt,
          status: o.status,
          type: o.type,
          customer_name: p.customer.name,
          customer_phone: p.customer.phone,
          delivery_street: p.delivery.street ?? null,
          delivery_number: p.delivery.number ?? null,
          delivery_floor_apt: p.delivery.floor_apt ?? null,
          delivery_references: p.delivery.references ?? null,
          scheduled_for: o.scheduledFor,
          payment_method: o.paymentMethod,
          payment_status: o.paymentStatus,
          cash_paid_with: p.payment.cash_paid_with,
          paid_at: this.paidAt.get(o.id) ?? null,
          cancel_reason: this.cancelReasons.get(o.id) ?? null,
          estimated_minutes: o.estimatedMinutes,
          subtotal: o.subtotal,
          discount: o.discount,
          delivery_fee: o.deliveryFee,
          tip: o.tip,
          total: o.total,
          tables: table ? { number: table.number } : null,
          delivery_zones: null,
          order_items: p.items.map((i, n) => ({
            id: `${o.id}-${n}`,
            name_snapshot: i.name,
            quantity: i.quantity,
            unit_price_snapshot: i.unit_price,
            line_total: i.line_total,
            note: i.note,
            sort: n,
            order_item_modifiers: i.modifiers.map((m) => ({
              name_snapshot: m.name,
              price_delta_snapshot: m.price_delta,
            })),
          })),
          order_status_history: o.history.map((h, n) => ({
            id: n,
            from_status: null,
            to_status: h.status,
            reason: h.status === 'cancelled' ? (this.cancelReasons.get(o.id) ?? null) : null,
            created_at: h.at,
          })),
        },
      ]
    })
  }

  /** The admin dashboard RPC, computed from the orders in memory. */
  private dashboard(from: string, to: string) {
    const sold = this.adminOrders().filter(
      (o) =>
        o.status !== 'cancelled' &&
        o.status !== 'pending_payment' &&
        o.business_date >= from &&
        o.business_date <= to,
    )
    const sum = (rows: { total: number }[]) => rows.reduce((n, r) => n + r.total, 0)
    const group = (key: (o: (typeof sold)[number]) => string) =>
      [...new Set(sold.map(key))].map((k) => {
        const rows = sold.filter((o) => key(o) === k)
        return { key: k, orders: rows.length, sales: sum(rows) }
      })
    const days: { date: string; orders: number; sales: number }[] = []
    for (
      let d = new Date(`${from}T00:00:00Z`);
      d <= new Date(`${to}T00:00:00Z`);
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const date = d.toISOString().slice(0, 10)
      const rows = sold.filter((o) => o.business_date === date)
      days.push({ date, orders: rows.length, sales: sum(rows) })
    }
    const products = new Map<string, { quantity: number; revenue: number }>()
    for (const o of sold) {
      for (const i of o.order_items) {
        const prev = products.get(i.name_snapshot)
        products.set(i.name_snapshot, {
          quantity: (prev?.quantity ?? 0) + i.quantity,
          revenue: (prev?.revenue ?? 0) + i.line_total,
        })
      }
    }
    return {
      from,
      to,
      totals: {
        orders: sold.length,
        sales: sum(sold),
        avg_ticket: sold.length ? Math.round(sum(sold) / sold.length) : 0,
        tips: sold.reduce((n, o) => n + o.tip, 0),
        delivery_fees: sold.reduce((n, o) => n + o.delivery_fee, 0),
        discounts: sold.reduce((n, o) => n + o.discount, 0),
      },
      by_day: days,
      top_products: [...products.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 8),
      by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: hour === 21 ? sold.length : 0 })),
      payment_mix: group((o) => o.payment_method).map(({ key, ...v }) => ({ method: key, ...v })),
      by_type: group((o) => o.type).map(({ key, ...v }) => ({ type: key, ...v })),
    }
  }

  /** A signed (but fake) session: supabase-js only decodes it, the mock REST server trusts it. */
  private session() {
    const expiresAt = Math.floor(this.now.getTime() / 1000) + 3600
    const part = (o: unknown) =>
      btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: this.staff.id, role: 'authenticated', aud: 'authenticated', email: this.staff.email, exp: expiresAt })}.e2e`
    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: expiresAt,
      refresh_token: 'refresh-e2e',
      user: {
        id: this.staff.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: this.staff.email,
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }
  }

  async auth(route: BackendRoute, cors: Record<string, string>): Promise<void> {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const path = new URL(request.url()).pathname
    if (path.endsWith('/token')) {
      const grant = new URL(request.url()).searchParams.get('grant_type')
      const body = JSON.parse(request.postData() ?? '{}') as { email?: string; password?: string }
      if (
        grant === 'password' &&
        (body.email !== this.staff.email || body.password !== this.staff.password)
      ) {
        return route.fulfill({
          status: 400,
          headers: cors,
          json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
        })
      }
      return route.fulfill({ status: 200, headers: cors, json: this.session() })
    }
    if (path.endsWith('/user'))
      return route.fulfill({ status: 200, headers: cors, json: this.session().user })
    return route.fulfill({ status: 204, headers: cors })
  }

  /** Staff RPCs (SECURITY DEFINER functions in Postgres). */
  private async rpc(route: BackendRoute, name: string, cors: Record<string, string>): Promise<void> {
    const args = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    const fail = (message: string) =>
      route.fulfill({
        status: 400,
        headers: cors,
        json: { code: 'P0001', message, details: null, hint: null },
      })
    if (name === 'admin_dashboard')
      return route.fulfill({
        status: 200,
        headers: cors,
        json: this.dashboard(String(args.p_from), String(args.p_to)),
      })
    if (name === 'mark_order_paid') {
      const entry = [...this.state.storedByToken.values()].find((o) => o.id === args.p_order_id)
      if (!entry) return fail('NOT_MANUAL_PAYMENT')
      entry.paymentStatus = 'paid'
      this.paidAt.set(entry.id, this.now.toISOString())
      this.pushChange('orders', 'UPDATE', { id: entry.id })
      return route.fulfill({ status: 200, headers: cors, json: {} })
    }
    if (name === 'transition_order') {
      if (args.p_to === 'cancelled')
        this.cancelReasons.set(
          String(args.p_order_id),
          typeof args.p_reason === 'string' ? args.p_reason : '',
        )
      const result = this.transition(String(args.p_order_id), args.p_to as OrderStatus)
      return result.ok ? route.fulfill({ status: 200, headers: cors, json: {} }) : fail(result.message)
    }
    if (name === 'set_product_available') {
      const row = this.rows.products.find((p) => p.id === args.p_product_id)
      if (!row) return fail('PRODUCT_NOT_FOUND')
      this.setProductAvailable(row.name, args.p_available === true)
      return route.fulfill({ status: 204, headers: cors })
    }
    if (name === 'set_store_paused') {
      this.setPaused(args.p_paused === true)
      return route.fulfill({ status: 204, headers: cors })
    }
    return route.fulfill({ status: 404, headers: cors, json: { message: `no rpc ${name}` } })
  }

  /** CORS headers for a mocked request (the page origin is echoed back). */
  corsHeaders(route: BackendRoute): Record<string, string> {
    return {
      'access-control-allow-origin': route.request().headers().origin ?? SITE,
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
      vary: 'Origin',
    }
  }

  /** Edge Functions: the REAL handlers from supabase/functions/_shared over the in-memory repo. */
  async functionRoute(route: BackendRoute): Promise<void> {
    const handlers: Record<string, (req: Request, deps: Deps) => Promise<Response>> = {
      'quote-order': handleQuoteOrder,
      'create-order': handleCreateOrder,
      'get-order': handleGetOrder,
      'create-mp-preference': handleCreateMpPreference,
      'mp-webhook': handleMpWebhook,
      'cloudinary-sign': handleCloudinarySign,
      'invite-staff': handleInviteStaff,
    }
    const request = route.request()
    const cors = this.corsHeaders(route)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const name = new URL(request.url()).pathname.split('/').pop() ?? ''
    const handler = handlers[name]
    if (!handler)
      return route.fulfill({
        status: 404,
        headers: cors,
        json: { error: { code: 'NOT_FOUND', message: 'no function' } },
      })
    const deps = this.deps()
    const wrapped = withHttp(
      { allowedOrigins: [SITE] },
      (req) => handler(req, deps),
      () => undefined,
    )
    const res = await wrapped(
      new Request(request.url(), {
        method: 'POST',
        headers: request.headers(),
        body: request.postData() ?? '{}',
      }),
    )
    const headers: Record<string, string> = { ...cors }
    res.headers.forEach((v, k) => (headers[k] = v))
    return route.fulfill({ status: res.status, headers, body: await res.text() })
  }

  /** Minimal Phoenix channels (protocol v2: [join_ref, ref, topic, event, payload]) — enough for Realtime clients. */
  attachSocket(ws: BackendSocket): void {
    this.sockets.add(ws)
    this.joined.set(ws, new Map())
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(raw) as [
        string | null,
        string | null,
        string,
        string,
        unknown,
      ]
      const reply = (response: unknown) =>
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]))
      if (event === 'phx_join') {
        const wanted =
          (payload as { config?: { postgres_changes?: { event: string; schema: string; table: string }[] } })
            .config?.postgres_changes ?? []
        const bindings = wanted.map((b) => ({ ...b, id: ++this.bindingId }))
        this.joined.get(ws)?.set(topic, bindings)
        reply({ postgres_changes: bindings })
      } else if (event === 'phx_leave') {
        this.joined.get(ws)?.delete(topic)
        reply({})
      } else if (event === 'heartbeat') {
        reply({})
      }
    })
    ws.onClose(() => {
      this.sockets.delete(ws)
      this.joined.delete(ws)
    })
  }

  /** Push a broadcast message to every socket subscribed to `realtime:<topic>`. */
  broadcast(topic: string, event: string, payload: unknown): void {
    for (const ws of this.sockets) {
      if (this.joined.get(ws)?.has(`realtime:${topic}`)) {
        ws.send(
          JSON.stringify([
            null,
            null,
            `realtime:${topic}`,
            'broadcast',
            { type: 'broadcast', event, payload },
          ]),
        )
      }
    }
  }

  /** Push a postgres_changes event to every channel that subscribed to this table (ids = the binding ids we assigned). */
  pushChange(table: string, type: 'INSERT' | 'UPDATE' | 'DELETE', record: unknown): void {
    for (const ws of this.sockets) {
      for (const [topic, bindings] of this.joined.get(ws) ?? []) {
        const ids = bindings
          .filter((b) => b.table === table && (b.event === '*' || b.event === type))
          .map((b) => b.id)
        if (ids.length === 0) continue
        ws.send(
          JSON.stringify([
            null,
            null,
            topic,
            'postgres_changes',
            {
              ids,
              data: {
                schema: 'public',
                table,
                commit_timestamp: new Date().toISOString(),
                type,
                record,
                old_record: {},
                columns: [],
                errors: null,
              },
            },
          ]),
        )
      }
    }
  }
}
