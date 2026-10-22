import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/client'
import type { OrderInput, QuoteDto } from '@/types/api'
import type { CartItem } from './store'

export interface OrderShape {
  type: 'pickup' | 'delivery' | 'dine_in'
  zoneId?: string | null
  address?: { street: string; number: string; floorApt?: string; references?: string } | null
  tableNumber?: number | null
  /** ISO time for scheduled orders; null/undefined = as soon as possible. */
  scheduledAt?: string | null
  tip?: number
  couponCode?: string | null
}

/** Builds the `quote-order` / `create-order` body. Only ids, quantities and notes are sent: never a price. */
const textOr = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : fallback
}

export function buildOrderInput(items: readonly CartItem[], shape: OrderShape): OrderInput {
  const input: OrderInput = {
    items: items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      modifier_ids: i.modifierIds,
      ...(i.note.trim() ? { note: i.note.trim() } : {}),
    })),
    type: shape.type,
    schedule: shape.scheduledAt ? { mode: 'scheduled', at: shape.scheduledAt } : { mode: 'asap' },
  }
  if (shape.couponCode) input.coupon_code = shape.couponCode
  if (shape.tip) input.tip = shape.tip
  if (shape.type === 'delivery' && shape.zoneId) {
    input.delivery = {
      zone_id: shape.zoneId,
      street: textOr(shape.address?.street, 'Sin definir'),
      number: textOr(shape.address?.number, '0'),
      ...(shape.address?.floorApt?.trim() ? { floor_apt: shape.address.floorApt.trim() } : {}),
      ...(shape.address?.references?.trim() ? { references: shape.address.references.trim() } : {}),
    }
  }
  if (shape.type === 'dine_in' && shape.tableNumber) input.table_number = shape.tableNumber
  return input
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(value)
    }, ms)
    return () => {
      window.clearTimeout(id)
    }
  }, [value, ms])
  return debounced
}

/**
 * The server's authoritative totals for a cart. Debounced; keeps the previous answer on screen while refetching so
 * numbers don't flicker. The local `computeQuote` preview fills in until the first answer arrives.
 */
export function useQuote(input: OrderInput | null) {
  const debounced = useDebounced(input, 250)
  return useQuery<QuoteDto>({
    queryKey: ['quote', debounced],
    queryFn: ({ signal }) => api().call<QuoteDto>('quote-order', debounced, { signal }),
    enabled: debounced !== null && debounced.items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry: false,
  })
}
