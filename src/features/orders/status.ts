import type { OrderStatus, OrderType } from '@/lib/orderStatus'

export type RailStep = 'received' | 'preparing' | 'ready' | 'on_the_way' | 'delivered'

export interface RailStepInfo {
  key: RailStep
  /** The order statuses that mean "this step is where the order is now". */
  status: OrderStatus
  label: string
}

/** The kitchen rail, per order type: comal → plato → bolsa → moto (delivery) or mostrador (pickup / mesa). */
export function railSteps(type: OrderType): RailStepInfo[] {
  const base: RailStepInfo[] = [
    { key: 'received', status: 'received', label: 'Recibido' },
    { key: 'preparing', status: 'preparing', label: 'En el comal' },
    {
      key: 'ready',
      status: 'ready',
      label:
        type === 'delivery'
          ? 'Empacado'
          : type === 'dine_in'
            ? 'Listo para llevar a tu mesa'
            : 'Listo en el mostrador',
    },
  ]
  if (type === 'delivery') base.push({ key: 'on_the_way', status: 'out_for_delivery', label: 'En camino' })
  base.push({ key: 'delivered', status: 'delivered', label: type === 'dine_in' ? 'En tu mesa' : 'Entregado' })
  return base
}

/** Index of the current step in `railSteps(type)`; -1 while waiting for payment, null once cancelled. */
export function currentStepIndex(status: OrderStatus, type: OrderType): number | null {
  if (status === 'cancelled') return null
  if (status === 'pending_payment') return -1
  return railSteps(type).findIndex((s) => s.status === status)
}

/** What the screen reader hears when the status changes (voseo, short). */
export function announcement(status: OrderStatus, type: OrderType): string {
  switch (status) {
    case 'pending_payment':
      return 'Estamos esperando que se acredite tu pago.'
    case 'received':
      return '¡Sale! Recibimos tu pedido.'
    case 'preparing':
      return 'Tu pedido está en el comal.'
    case 'ready':
      return type === 'delivery'
        ? 'Tu pedido está empacado, ya sale el repartidor.'
        : type === 'dine_in'
          ? 'Tu pedido está listo, te lo llevamos a la mesa.'
          : '¡Órale, ya está tu orden! Pasá a buscarla.'
    case 'out_for_delivery':
      return 'Tu pedido salió: va en camino.'
    case 'delivered':
      return type === 'delivery' ? 'Entregado. ¡Provecho!' : '¡Provecho!'
    case 'cancelled':
      return 'Tu pedido fue cancelado. Escribinos si tenés dudas.'
  }
}

export function headline(status: OrderStatus, type: OrderType): string {
  switch (status) {
    case 'pending_payment':
      return 'Confirmando tu pago…'
    case 'received':
      return '¡Sale! Recibimos tu pedido'
    case 'preparing':
      return 'Está en el comal'
    case 'ready':
      return type === 'delivery' ? 'Empacado, ya sale' : '¡Órale, ya está tu orden!'
    case 'out_for_delivery':
      return 'Va en camino'
    case 'delivered':
      return 'Provecho'
    case 'cancelled':
      return 'Pedido cancelado'
  }
}

/** Minutes left until the estimate, never negative; null when there is no estimate or the order is closed. */
export function minutesLeft(
  createdAt: string,
  estimatedMinutes: number | null,
  status: OrderStatus,
  now: Date,
): number | null {
  if (
    estimatedMinutes === null ||
    status === 'delivered' ||
    status === 'cancelled' ||
    status === 'ready' ||
    status === 'out_for_delivery'
  )
    return null
  const eta = Date.parse(createdAt) + estimatedMinutes * 60_000
  return Math.max(0, Math.ceil((eta - now.getTime()) / 60_000))
}
