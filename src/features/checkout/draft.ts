import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface DraftState {
  name: string
  phone: string
  remember: (name: string, phone: string) => void
}

/** Name and WhatsApp are remembered on this device so the second order takes seconds (no account involved). */
export const useDraft = create<DraftState>()(
  persist(
    (set) => ({
      name: '',
      phone: '',
      remember: (name, phone) => {
        set({ name, phone })
      },
    }),
    {
      name: 'takitho-draft',
      version: 1,
      storage: createJSONStorage<Pick<DraftState, 'name' | 'phone'>>(() => ({
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
            /* blocked */
          }
        },
        removeItem: (k) => {
          try {
            window.localStorage.removeItem(k)
          } catch {
            /* blocked */
          }
        },
      })),
      partialize: (s) => ({ name: s.name, phone: s.phone }),
      migrate: () => ({ name: '', phone: '' }),
    },
  ),
)
