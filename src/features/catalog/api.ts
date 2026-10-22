import { db } from '@/lib/supabase'
import type { Menu, MenuGroup, MenuProduct, PromoInfo, DeliveryZoneInfo, Shifts, StoreInfo } from './types'

// anon can only read these columns of store_settings (column grants, migration rls_and_grants)
const STORE_COLUMNS =
  'name, tagline, address, maps_url, whatsapp, instagram, facebook, tiktok, prep_minutes, is_paused, is_closed_manually, accepts_scheduled_when_closed, max_schedule_days, pay_mp_enabled, pay_cash_enabled, pay_transfer_enabled, tip_presets, timezone'

function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null || result.data === undefined) throw new Error('Respuesta vacía')
  return result.data
}

export async function fetchStore(): Promise<StoreInfo> {
  const r = must(await db().from('store_settings').select(STORE_COLUMNS).eq('id', 1).single())
  return {
    name: r.name,
    tagline: r.tagline,
    address: r.address,
    mapsUrl: r.maps_url,
    whatsapp: r.whatsapp,
    instagram: r.instagram,
    facebook: r.facebook,
    tiktok: r.tiktok,
    prepMinutes: r.prep_minutes,
    isPaused: r.is_paused,
    isClosedManually: r.is_closed_manually,
    acceptsScheduledWhenClosed: r.accepts_scheduled_when_closed,
    maxScheduleDays: r.max_schedule_days,
    payMpEnabled: r.pay_mp_enabled,
    payCashEnabled: r.pay_cash_enabled,
    payTransferEnabled: r.pay_transfer_enabled,
    tipPresets: r.tip_presets,
    timezone: r.timezone,
  }
}

export async function fetchHours(): Promise<Shifts> {
  const rows = must(await db().from('opening_hours').select('weekday, opens_at, closes_at'))
  return rows.map((r) => ({ weekday: r.weekday, opensAt: r.opens_at, closesAt: r.closes_at }))
}

export async function fetchZones(): Promise<DeliveryZoneInfo[]> {
  const rows = must(
    await db().from('delivery_zones').select('id, name, neighborhoods, fee, min_order').order('sort'),
  )
  return rows.map((z) => ({
    id: z.id,
    name: z.name,
    neighborhoods: z.neighborhoods,
    fee: z.fee,
    minOrder: z.min_order,
  }))
}

export async function fetchPromos(): Promise<PromoInfo[]> {
  const rows = must(await db().from('coupons').select('id, label, kind, value, weekdays, min_purchase'))
  return rows.map((c) => ({
    id: c.id,
    label: c.label,
    kind: c.kind,
    value: c.value,
    weekdays: c.weekdays,
    minPurchase: c.min_purchase,
  }))
}

const spice = (n: number): 0 | 1 | 2 | 3 => (n === 1 || n === 2 || n === 3 ? n : 0)

export async function fetchMenu(): Promise<Menu> {
  const rest = db()
  const [categories, products, groups, links, combos] = await Promise.all([
    rest.from('categories').select('id, name, slug, description').order('sort'),
    rest.from('products').select('*').order('sort'),
    rest
      .from('modifier_groups')
      .select(
        'id, name, min_select, max_select, is_required, modifiers(id, name, price_delta, is_available, sort)',
      )
      .order('sort'),
    rest.from('product_modifier_groups').select('product_id, group_id, sort').order('sort'),
    rest.from('combo_items').select('combo_id, product_id, quantity'),
  ])

  const groupMap: Record<string, MenuGroup> = {}
  for (const g of must(groups)) {
    groupMap[g.id] = {
      id: g.id,
      name: g.name,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      isRequired: g.is_required,
      modifiers: [...g.modifiers]
        .sort((a, b) => a.sort - b.sort)
        .map((m) => ({ id: m.id, name: m.name, priceDelta: m.price_delta, isAvailable: m.is_available })),
    }
  }
  const linkRows = must(links)
  const comboRows = must(combos)

  const list: MenuProduct[] = must(products).map((p) => ({
    id: p.id,
    categoryId: p.category_id,
    type: p.type,
    name: p.name,
    slug: p.slug,
    description: p.description,
    unitLabel: p.unit_label,
    price: p.price,
    imagePublicId: p.image_public_id,
    spicyLevel: spice(p.spicy_level),
    tags: p.tags,
    isAvailable: p.is_available,
    groupIds: linkRows
      .filter((l) => l.product_id === p.id)
      .map((l) => l.group_id)
      .filter((id) => id in groupMap),
    combo: comboRows
      .filter((c) => c.combo_id === p.id)
      .map((c) => ({ productId: c.product_id, quantity: c.quantity })),
  }))

  return {
    categories: must(categories),
    products: list,
    groups: groupMap,
    productsById: Object.fromEntries(list.map((p) => [p.id, p])),
  }
}
