import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface TableState {
  /** Table number from the QR (?mesa=N). Kept for the browsing session only (sessionStorage). */
  tableNumber: number | null
  setTable: (n: number | null) => void
}

export const useTable = create<TableState>()(
  persist(
    (set) => ({
      tableNumber: null,
      setTable: (tableNumber) => {
        set({ tableNumber })
      },
    }),
    { name: 'takitho-mesa', storage: createJSONStorage(() => sessionStorage) },
  ),
)

/** Parses the `mesa` query value: a whole number 1–999, anything else is ignored. */
export function parseTable(value: string | null): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null
  const n = Number(value)
  return n >= 1 ? n : null
}
