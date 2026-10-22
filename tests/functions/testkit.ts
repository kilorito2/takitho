// In-memory Repo + helpers for Edge Function tests. Business rules live in the shared core and in SQL
// (tested elsewhere); this fake only has to honour the Repo contract.
import type { OpeningShift } from '../../supabase/functions/_shared/hours.ts'
import type { PricingProduct, PricingZone } from '../../supabase/functions/_shared/pricing.ts'
import {
  RepoError,
  type CouponRecord,
  type CreatedOrder,
  type Deps,
  type ExistingOrder,
  type FunctionConfig,
  type OrderTxPayload,
  type PaymentResultArgs,
  type Repo,
  type StaffRole,
  type StoreSettings,
  type StoredOrder,
} from '../../supabase/functions/_shared/ports.ts'

export const ID = {
  pastor: '11111111-1111-4111-8111-111111111111',
  asada: '11111111-1111-4111-8111-222222222222',
  horchata: '11111111-1111-4111-8111-333333333333',
  agotado: '11111111-1111-4111-8111-444444444444',
  maiz: '22222222-2222-4222-8222-111111111111',
  harina: '22222222-2222-4222-8222-222222222222',
  verde: '22222222-2222-4222-8222-333333333333',
  queso: '22222222-2222-4222-8222-444444444444',
  zone: '33333333-3333-4333-8333-111111111111',
  table: '44444444-4444-4444-8444-111111111111',
  catTacos: '55555555-5555-4555-8555-111111111111',
}

export const TZ = 'America/Argentina/Buenos_Aires'
export const ba = (local: string): Date => new Date(`${local}:00-03:00`)
/** Monday 21:00 in Buenos Aires: inside the 19:00–01:00 shift. */
export const OPEN_NOW = ba('2026-10-19T21:00')
export const CLOSED_NOW = ba('2026-10-19T12:00')

const tortilla = {
  id: 'g-tortilla',
  name: 'Tortilla',
  minSelect: 1,
  maxSelect: 1,
  isRequired: true,
  modifiers: [
    { id: ID.maiz, name: 'Maíz', priceDelta: 0, isAvailable: true },
    { id: ID.harina, name: 'Harina', priceDelta: 0, isAvailable: true },
  ],
}
const extras = {
  id: 'g-extras',
  name: 'Extras',
  minSelect: 0,
  maxSelect: 3,
  isRequired: false,
  modifiers: [
    { id: ID.verde, name: 'Verde', priceDelta: 0, isAvailable: true },
    { id: ID.queso, name: 'Queso extra', priceDelta: 900, isAvailable: true },
  ],
}

export const products: PricingProduct[] = [
  {
    id: ID.pastor,
    name: 'Tacos al pastor con piña',
    price: 7200,
    categoryId: ID.catTacos,
    isAvailable: true,
    groups: [tortilla, extras],
  },
  {
    id: ID.asada,
    name: 'Tacos de asada',
    price: 7800,
    categoryId: ID.catTacos,
    isAvailable: true,
    groups: [tortilla],
  },
  {
    id: ID.horchata,
    name: 'Agua fresca de horchata',
    price: 3200,
    categoryId: 'c-bebidas',
    isAvailable: true,
    groups: [],
  },
  { id: ID.agotado, name: 'Tamarindo', price: 3200, categoryId: 'c-bebidas', isAvailable: false, groups: [] },
]

export const nightly: OpeningShift[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  opensAt: '19:00',
  closesAt: '01:00',
}))

export const defaultSettings = (): StoreSettings => ({
  name: 'Takitho',
  whatsapp: '5491155550000',
  prepMinutes: 25,
  isPaused: false,
  isClosedManually: false,
  acceptsScheduledWhenClosed: false,
  maxScheduleDays: 2,
  payMpEnabled: true,
  payCashEnabled: true,
  payTransferEnabled: true,
  timezone: TZ,
  transferAlias: 'takitho.tacos',
  transferCbu: '0000003100000000000001',
  transferHolder: 'Takitho SRL',
  pendingPaymentTtlMin: 30,
})

export const zone: PricingZone = { id: ID.zone, fee: 1500, minOrder: 7000 }

export function coupon(over: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'cp-1',
    code: 'TACOS10',
    label: '10 % de descuento',
    kind: 'percent',
    value: 10,
    scope: 'all',
    scopeIds: [],
    weekdays: [],
    startsAt: null,
    endsAt: null,
    maxUses: null,
    usesCount: 0,
    maxUsesPerPhone: null,
    usesByPhone: 0,
    minPurchase: 0,
    isActive: true,
    ...over,
  }
}

export interface FakeState {
  settings: StoreSettings
  shifts: OpeningShift[]
  products: PricingProduct[]
  zones: PricingZone[]
  tables: Record<number, { id: string }>
  coupons: CouponRecord[]
  orders: (CreatedOrder & { request_hash: string; key: string; payload: OrderTxPayload })[]
  rate: Map<string, number>
  rateMax: Record<string, number>
  applied: PaymentResultArgs[]
  storedByToken: Map<string, StoredOrder>
  staff: Map<string, { userId: string; role: StaffRole }>
  invites: { email: string; role: StaffRole }[]
  preferenceIds: Map<string, string>
}

export function makeState(over: Partial<FakeState> = {}): FakeState {
  return {
    settings: defaultSettings(),
    shifts: nightly,
    products,
    zones: [zone],
    tables: { 3: { id: ID.table } },
    coupons: [],
    orders: [],
    rate: new Map(),
    rateMax: {},
    applied: [],
    storedByToken: new Map(),
    staff: new Map(),
    invites: [],
    preferenceIds: new Map(),
    ...over,
  }
}

export function makeRepo(state: FakeState): Repo {
  return {
    loadSettings: () => Promise.resolve(state.settings),
    loadHours: () => Promise.resolve(state.shifts),
    loadProducts: (ids) => Promise.resolve(state.products.filter((p) => ids.includes(p.id))),
    loadZone: (id) => Promise.resolve(state.zones.find((z) => z.id === id) ?? null),
    loadTableByNumber: (n) => Promise.resolve(state.tables[n] ?? null),
    findCouponByCode: (code) =>
      Promise.resolve(state.coupons.find((c) => c.code?.toUpperCase() === code.trim().toUpperCase()) ?? null),
    listAutoCoupons: () => Promise.resolve(state.coupons.filter((c) => c.code === null)),
    findOrderByKey(key): Promise<ExistingOrder | null> {
      const o = state.orders.find((x) => x.key === key)
      return Promise.resolve(o ? { ...o, replayed: true } : null)
    },
    checkRateLimit(key, max) {
      const n = (state.rate.get(key) ?? 0) + 1
      state.rate.set(key, n)
      state.rateMax[key] = max
      return Promise.resolve({ allowed: n <= max, retryAfterSeconds: 321 })
    },
    createOrderTx(payload): Promise<CreatedOrder> {
      const prior = state.orders.find((o) => o.key === payload.idempotency_key)
      if (prior) {
        if (prior.request_hash !== payload.request_hash)
          return Promise.reject(new RepoError('IDEMPOTENCY_KEY_REUSED'))
        return Promise.resolve({ ...prior, replayed: true })
      }
      const created: CreatedOrder = {
        id: crypto.randomUUID(),
        code: `TK-${String(state.orders.length + 1).padStart(4, '0')}`,
        public_token: crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a'),
        status: payload.initial_status,
        payment_status: 'pending',
        total: payload.totals.total,
        estimated_minutes: payload.estimated_minutes,
        replayed: false,
      }
      state.orders.push({
        ...created,
        request_hash: payload.request_hash,
        key: payload.idempotency_key,
        payload,
      })
      return Promise.resolve(created)
    },
    getOrderByToken: (token) => Promise.resolve(state.storedByToken.get(token) ?? null),
    setPreferenceId(orderId, preferenceId) {
      state.preferenceIds.set(orderId, preferenceId)
      return Promise.resolve()
    },
    applyPaymentResult(args) {
      state.applied.push(args)
      return Promise.resolve({ result: 'paid' })
    },
    authenticateStaff: (jwt) => Promise.resolve(state.staff.get(jwt) ?? null),
    inviteStaff({ email, role }) {
      state.invites.push({ email, role })
      return Promise.resolve({ userId: 'user-new' })
    },
  }
}

export const baseConfig = (over: Partial<FunctionConfig> = {}): FunctionConfig => ({
  allowedOrigins: ['https://takitho.test'],
  siteUrl: 'https://takitho.test',
  functionsUrl: 'https://proj.supabase.co/functions/v1',
  ipHashSalt: 'salt',
  turnstileSecret: null,
  mp: {
    accessToken: 'TEST-token',
    webhookSecret: 'whsec',
    env: 'sandbox',
    apiBase: 'https://api.mercadopago.test',
  },
  cloudinary: { cloudName: 'demo', apiKey: '123456', apiSecret: 'shhh' },
  limits: { createIp: 5, createPhone: 3, quoteIp: 60, getOrderIp: 120, windowSeconds: 600 },
  ...over,
})

export interface Harness {
  state: FakeState
  deps: Deps
  logs: unknown[][]
  fetchCalls: { url: string; init?: RequestInit }[]
}

export function makeHarness(
  opts: {
    now?: Date
    state?: Partial<FakeState>
    config?: Partial<FunctionConfig>
    fetch?: typeof fetch
  } = {},
): Harness {
  const state = makeState(opts.state)
  const logs: unknown[][] = []
  const fetchCalls: Harness['fetchCalls'] = []
  const fetchImpl: typeof fetch =
    opts.fetch ??
    ((input, init) => {
      fetchCalls.push({ url: urlOf(input), ...(init ? { init } : {}) })
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
  return {
    state,
    logs,
    fetchCalls,
    deps: {
      repo: makeRepo(state),
      config: baseConfig(opts.config),
      now: () => opts.now ?? OPEN_NOW,
      fetch: fetchImpl,
      log: (...args) => {
        logs.push(args)
      },
    },
  }
}

export const post = (
  body: unknown,
  headers: Record<string, string> = {},
  url = 'https://proj.supabase.co/functions/v1/x',
): Request =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: JSON.stringify(body),
  })

/** URL of a fetch() first argument without relying on implicit stringification. */
export const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

/** Text body of a RequestInit (our code only ever sends JSON strings). */
export const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : ''

export const KEY = '99999999-9999-4999-8999-999999999999'

/** A valid cash pickup order for `create-order`. */
export const orderBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  idempotency_key: crypto.randomUUID(),
  items: [
    { product_id: ID.pastor, quantity: 2, modifier_ids: [ID.maiz, ID.queso], note: 'sin cebolla porfa' },
  ],
  type: 'pickup',
  schedule: { mode: 'asap' },
  customer: { name: 'Ana Pérez', phone: '11 1234-5678' },
  payment: { method: 'cash', cash_paid_with: 20000 },
  ...over,
})
