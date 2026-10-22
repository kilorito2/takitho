import { create } from 'zustand'

interface UiState {
  cartOpen: boolean
  setCartOpen: (open: boolean) => void
  /** Product sheet: `lineId` is set when editing an item already in the cart. */
  sheet: { productId: string; lineId: string | null } | null
  openProduct: (productId: string, lineId?: string | null) => void
  closeProduct: () => void
}

/** Ephemeral UI state shared across pages (the cart drawer and the product sheet live in the layout). */
export const useUi = create<UiState>((set) => ({
  cartOpen: false,
  setCartOpen: (cartOpen) => {
    set({ cartOpen })
  },
  sheet: null,
  openProduct: (productId, lineId = null) => {
    set({ sheet: { productId, lineId } })
  },
  closeProduct: () => {
    set({ sheet: null })
  },
}))
