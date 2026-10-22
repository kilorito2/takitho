import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastState {
  items: ToastItem[]
  push: (item: Omit<ToastItem, 'id'>, ms: number) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (item, ms) => {
    const id = nextId++
    set((s) => ({ items: [...s.items.slice(-3), { ...item, id }] })) // keep the stack short
    window.setTimeout(() => {
      get().dismiss(id)
    }, ms)
    return id
  },
  dismiss: (id) => {
    set((s) => ({ items: s.items.filter((t) => t.id !== id) }))
  },
}))

interface ToastOptions {
  description?: string
  /** Defaults: 4 s, errors 7 s. */
  duration?: number
}

function show(tone: ToastTone, title: string, { description, duration }: ToastOptions = {}): number {
  const item: Omit<ToastItem, 'id'> =
    description === undefined ? { tone, title } : { tone, title, description }
  return useToastStore.getState().push(item, duration ?? (tone === 'error' ? 7000 : 4000))
}

/** Imperative API: `toast.success('Sumado a la comanda')`. Render <Toaster /> once at the root. */
export const toast = {
  success: (title: string, options?: ToastOptions) => show('success', title, options),
  error: (title: string, options?: ToastOptions) => show('error', title, options),
  info: (title: string, options?: ToastOptions) => show('info', title, options),
  dismiss: (id: number) => {
    useToastStore.getState().dismiss(id)
  },
}
