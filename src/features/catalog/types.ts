import type { OpeningShift } from '@/lib/hours'

export interface MenuCategory {
  id: string
  name: string
  slug: string
  description: string
}

export interface MenuModifier {
  id: string
  name: string
  priceDelta: number
  isAvailable: boolean
}

export interface MenuGroup {
  id: string
  name: string
  minSelect: number
  maxSelect: number
  isRequired: boolean
  modifiers: MenuModifier[]
}

export type ProductTag = 'veggie' | 'sin_tacc' | 'destacado'

export interface MenuProduct {
  id: string
  categoryId: string | null
  type: 'single' | 'combo'
  name: string
  slug: string
  description: string
  unitLabel: string
  /** Whole ARS pesos. */
  price: number
  imagePublicId: string | null
  spicyLevel: 0 | 1 | 2 | 3
  tags: string[]
  isAvailable: boolean
  groupIds: string[]
  combo: { productId: string; quantity: number }[]
}

export interface Menu {
  categories: MenuCategory[]
  products: MenuProduct[]
  groups: Record<string, MenuGroup>
  productsById: Record<string, MenuProduct>
}

/** Public store settings (the anon-readable columns only). */
export interface StoreInfo {
  name: string
  tagline: string
  address: string
  mapsUrl: string
  whatsapp: string
  instagram: string
  facebook: string
  tiktok: string
  prepMinutes: number
  isPaused: boolean
  isClosedManually: boolean
  acceptsScheduledWhenClosed: boolean
  maxScheduleDays: number
  payMpEnabled: boolean
  payCashEnabled: boolean
  payTransferEnabled: boolean
  /** Percentage presets offered as tip. */
  tipPresets: number[]
  timezone: string
}

export interface DeliveryZoneInfo {
  id: string
  name: string
  neighborhoods: string[]
  fee: number
  minOrder: number
}

export interface PromoInfo {
  id: string
  label: string
  kind: 'percent' | 'fixed' | 'two_for_one'
  value: number
  weekdays: number[]
  minPurchase: number
}

export type Shifts = OpeningShift[]

/** The owner leaves "[COMPLETAR]" until the real data is loaded from the admin. */
export const isPlaceholder = (value: string): boolean => value.trim() === '' || value.includes('[COMPLETAR')
