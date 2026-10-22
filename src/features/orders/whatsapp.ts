import { formatARS } from '@/lib/money'
import type { PublicOrder } from '@/types/api'

const TYPE_TEXT = { pickup: 'retiro', delivery: 'delivery', dine_in: 'mesa' } as const

/** Pre-filled message for "Avisar al local por WhatsApp". Contains the code, never the secret tracking token. */
export function orderMessage(
  order: Pick<PublicOrder, 'code' | 'type' | 'items' | 'total' | 'table_number'>,
  customerName?: string,
): string {
  const lines = order.items.map(
    (i) =>
      `• ${i.quantity} × ${i.name}${i.modifiers.length > 0 ? ` (${i.modifiers.join(', ')})` : ''}${i.note ? ` — ${i.note}` : ''}`,
  )
  return [
    `¡Hola Takitho!${customerName ? ` Soy ${customerName}.` : ''}`,
    `Mi pedido ${order.code} (${TYPE_TEXT[order.type]}${order.type === 'dine_in' && order.table_number ? ` ${order.table_number}` : ''}):`,
    ...lines,
    `Total: ${formatARS(order.total)}`,
  ].join('\n')
}
