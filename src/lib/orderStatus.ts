// Pure core (ADR-0004/0005): order state machine. The same graph is enforced in Postgres by
// `transition_order()`; TRANSITION_ROWS seeds that table so both sides cannot drift.

export type OrderStatus =
  'pending_payment' | 'received' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'

export type OrderType = 'pickup' | 'delivery' | 'dine_in'

export const ALL_STATUSES: readonly OrderStatus[] = [
  'pending_payment',
  'received',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
]

export const ALL_ORDER_TYPES: readonly OrderType[] = ['pickup', 'delivery', 'dine_in']

const TERMINAL: readonly OrderStatus[] = ['delivered', 'cancelled']

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL.includes(status)
}

/** The single forward step of the happy path, or null when there is none. */
export function nextStatus(from: OrderStatus, type: OrderType): OrderStatus | null {
  switch (from) {
    case 'pending_payment':
      return 'received'
    case 'received':
      return 'preparing'
    case 'preparing':
      return 'ready'
    case 'ready':
      return type === 'delivery' ? 'out_for_delivery' : 'delivered'
    case 'out_for_delivery':
      return type === 'delivery' ? 'delivered' : null
    case 'delivered':
    case 'cancelled':
      return null
  }
}

/** Forward step first, then `cancelled` (any non-terminal state can be cancelled by an admin). */
export function allowedTransitions(from: OrderStatus, type: OrderType): OrderStatus[] {
  const next = nextStatus(from, type)
  if (next === null) return []
  return [next, 'cancelled']
}

export function canTransition(from: OrderStatus, to: OrderStatus, type: OrderType): boolean {
  return allowedTransitions(from, type).includes(to)
}

export interface TransitionRow {
  orderType: OrderType
  from: OrderStatus
  to: OrderStatus
}

export const TRANSITION_ROWS: readonly TransitionRow[] = ALL_ORDER_TYPES.flatMap((orderType) =>
  ALL_STATUSES.flatMap((from) => allowedTransitions(from, orderType).map((to) => ({ orderType, from, to }))),
)
