import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { MAX_LINE_QUANTITY } from '@/lib/pricing'

export interface CartItem {
  id: string
  productId: string
  quantity: number
  modifierIds: string[]
  note: string
  /** What the customer saw when adding it; compared with the live catalogue to warn about changes. */
  snapshot: { name: string; unitPrice: number; imagePublicId: string | null; modifierNames: string[] }
}

export type NewCartItem = Omit<CartItem, 'id'>

interface CartState {
  items: CartItem[]
  couponCode: string | null
  add: (item: NewCartItem) => void
  setQuantity: (id: string, quantity: number) => void
  remove: (id: string) => void
  replaceItem: (id: string, item: NewCartItem) => void
  setCoupon: (code: string | null) => void
  clear: () => void
  /** Replace everything (used by "repetir pedido"). */
  load: (items: NewCartItem[]) => void
}

/** Two lines are "the same" when product, options (any order) and note match. */
export const sameLine = (
  a: Pick<NewCartItem, 'productId' | 'modifierIds' | 'note'>,
  b: Pick<NewCartItem, 'productId' | 'modifierIds' | 'note'>,
): boolean =>
  a.productId === b.productId &&
  a.note.trim() === b.note.trim() &&
  a.modifierIds.length === b.modifierIds.length &&
  [...a.modifierIds].sort().join('|') === [...b.modifierIds].sort().join('|')

const clamp = (n: number): number => Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(n)))
const newId = (): string => crypto.randomUUID()

const memory = new Map<string, string>()
const memoryStorage: StateStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
}

/** Resolved on every call: localStorage can throw (private mode, quota, blocked cookies) → fall back to memory. */
const lazyStorage: StateStorage = {
  getItem: (k) => backing().getItem(k),
  setItem: (k, v) => {
    backing().setItem(k, v)
  },
  removeItem: (k) => {
    backing().removeItem(k)
  },
}
function backing(): StateStorage {
  try {
    const ls = window.localStorage
    ls.getItem('__takitho_probe__')
    return ls
  } catch {
    return memoryStorage
  }
}
const safeStorage = createJSONStorage<Pick<CartState, 'items' | 'couponCode'>>(() => lazyStorage)

export const CART_STORAGE_KEY = 'takitho-cart'
export const CART_VERSION = 1

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      couponCode: null,
      add: (item) => {
        set((s) => {
          const existing = s.items.find((i) => sameLine(i, item))
          if (existing) {
            return {
              items: s.items.map((i) =>
                i.id === existing.id ? { ...i, quantity: clamp(i.quantity + item.quantity) } : i,
              ),
            }
          }
          return { items: [...s.items, { ...item, quantity: clamp(item.quantity), id: newId() }] }
        })
      },
      setQuantity: (id, quantity) => {
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, quantity: clamp(quantity) } : i)) }))
      },
      remove: (id) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
      },
      replaceItem: (id, item) => {
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? { ...item, id, quantity: clamp(item.quantity) } : i)),
        }))
      },
      setCoupon: (code) => {
        set({ couponCode: code?.trim() ? code.trim().toUpperCase() : null })
      },
      clear: () => {
        set({ items: [], couponCode: null })
      },
      load: (items) => {
        set({
          items: items.map((i) => ({ ...i, quantity: clamp(i.quantity), id: newId() })),
          couponCode: null,
        })
      },
    }),
    {
      name: CART_STORAGE_KEY,
      version: CART_VERSION,
      storage: safeStorage,
      partialize: (s) => ({ items: s.items, couponCode: s.couponCode }),
      // A cart written by an unknown (older/newer) schema is dropped rather than risking a broken checkout.
      migrate: () => ({ items: [], couponCode: null }),
    },
  ),
)

export const cartCount = (items: readonly CartItem[]): number => items.reduce((n, i) => n + i.quantity, 0)
