// "Si al reabrirlo cambió un precio o algo se agotó, avisa": compares the saved cart with the live menu.
import { priceLine, validateModifierSelection, type PricingProduct } from '@/lib/pricing'
import type { CartItem } from './store'

export type LineStatus = 'ok' | 'price_changed' | 'unavailable' | 'removed' | 'invalid'

export interface CartLineView {
  item: CartItem
  status: LineStatus
  /** Price per unit right now (equals the saved one unless it changed). */
  unitPrice: number
  previousUnitPrice: number
  /** What to tell the customer, or null when all is fine. */
  message: string | null
}

export function revalidateCart(
  items: readonly CartItem[],
  catalogue: readonly PricingProduct[],
): CartLineView[] {
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  return items.map((item): CartLineView => {
    const previous = item.snapshot.unitPrice
    const base = { item, previousUnitPrice: previous }
    const product = byId.get(item.productId)
    if (!product) {
      return {
        ...base,
        status: 'removed',
        unitPrice: previous,
        message: `${item.snapshot.name} ya no está en el menú.`,
      }
    }
    if (!product.isAvailable) {
      return {
        ...base,
        status: 'unavailable',
        unitPrice: previous,
        message: `Se nos terminó ${product.name} por hoy.`,
      }
    }
    const selection = validateModifierSelection(product, item.modifierIds)
    if (!selection.ok) {
      const unavailable = selection.error.code === 'ITEM_UNAVAILABLE'
      return {
        ...base,
        status: unavailable ? 'unavailable' : 'invalid',
        unitPrice: previous,
        message: unavailable
          ? selection.error.message
          : `Las opciones de ${product.name} cambiaron: volvé a elegirlas.`,
      }
    }
    const priced = priceLine(product, {
      productId: item.productId,
      quantity: 1,
      modifierIds: item.modifierIds,
    })
    if (!priced.ok)
      return {
        ...base,
        status: 'invalid',
        unitPrice: previous,
        message: `No pudimos recalcular ${product.name}.`,
      }
    const current = priced.value.unitTotal
    if (current !== previous) {
      const delta = current - previous
      return {
        ...base,
        status: 'price_changed',
        unitPrice: current,
        message: `${product.name} ${delta > 0 ? 'subió' : 'bajó'} de precio.`,
      }
    }
    return { ...base, status: 'ok', unitPrice: current, message: null }
  })
}

/** Lines the customer can actually order. */
export const orderable = (views: readonly CartLineView[]): CartLineView[] =>
  views.filter((v) => v.status === 'ok' || v.status === 'price_changed')
export const blocking = (views: readonly CartLineView[]): CartLineView[] =>
  views.filter((v) => v.status !== 'ok' && v.status !== 'price_changed')
