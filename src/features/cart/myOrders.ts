import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { NewCartItem } from './store'

export interface SavedOrder {
  code: string
  /** Secret tracking token (ADR-0013). Stays on this device only. */
  token: string
  createdAt: string
  total: number
  type: 'pickup' | 'delivery' | 'dine_in'
  paymentMethod: 'mercado_pago' | 'cash' | 'transfer'
  /** What was ordered, so "Repetir pedido" can rebuild the cart. */
  items: NewCartItem[]
}

interface State {
  orders: SavedOrder[]
  add: (order: SavedOrder) => void
  remove: (code: string) => void
  clear: () => void
}

const MAX_SAVED = 30

/** localStorage can be blocked (private mode): the order still exists on the server and in its link. */
const storage: StateStorage = {
  getItem: (k) => {
    try {
      return window.localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      window.localStorage.setItem(k, v)
    } catch {
      /* storage blocked */
    }
  },
  removeItem: (k) => {
    try {
      window.localStorage.removeItem(k)
    } catch {
      /* storage blocked */
    }
  },
}

/** "Mis pedidos": kept on the device, no login. Newest first. */
export const useMyOrders = create<State>()(
  persist(
    (set) => ({
      orders: [],
      add: (order) => {
        set((s) => ({
          orders: [order, ...s.orders.filter((o) => o.code !== order.code)].slice(0, MAX_SAVED),
        }))
      },
      remove: (code) => {
        set((s) => ({ orders: s.orders.filter((o) => o.code !== code) }))
      },
      clear: () => {
        set({ orders: [] })
      },
    }),
    {
      name: 'takitho-orders',
      version: 1,
      storage: createJSONStorage<Pick<State, 'orders'>>(() => storage),
      partialize: (s) => ({ orders: s.orders }),
      migrate: () => ({ orders: [] }),
    },
  ),
)
