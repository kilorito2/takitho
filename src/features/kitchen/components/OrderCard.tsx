import { useDraggable } from '@dnd-kit/core'
import {
  AlertTriangle,
  Banknote,
  Bike,
  Flame,
  GripVertical,
  MapPin,
  Printer,
  Store,
  Timer,
  UtensilsCrossed,
  Phone,
  CalendarClock,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatARS } from '@/lib/money'
import { formatArPhone } from '@/lib/phone'
import { formatClock } from '@/lib/formatClock'
import {
  advanceAction,
  cashToCollect,
  dragTarget,
  elapsedMinutes,
  timerLevel,
  typeLabel,
  type KitchenOrder,
  type TimerLevel,
} from '../model'

const LEVEL_BORDER: Record<TimerLevel, string> = {
  ok: 'border-line',
  warn: 'border-maiz',
  late: 'border-chile-claro',
}

function TypeIcon({ order }: { order: KitchenOrder }) {
  const cls = 'size-5'
  if (order.type === 'delivery') return <Bike aria-hidden className={cls} />
  if (order.type === 'dine_in') return <UtensilsCrossed aria-hidden className={cls} />
  return <Store aria-hidden className={cls} />
}

/** Elapsed time with an icon and a word for the warning levels, so colour is never the only signal. */
function Elapsed({ minutes, level }: { minutes: number; level: TimerLevel }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 font-mono text-base font-bold',
        level === 'ok' && 'border-line text-ink',
        level === 'warn' && 'border-maiz bg-maiz text-carbon',
        level === 'late' && 'border-chile-claro bg-chile text-tortilla',
      )}
    >
      {level === 'late' ? (
        <Flame aria-hidden className="size-4" />
      ) : level === 'warn' ? (
        <AlertTriangle aria-hidden className="size-4" />
      ) : (
        <Timer aria-hidden className="size-4" />
      )}
      <span>{minutes} min</span>
      {level !== 'ok' && (
        <span className="font-sans text-sm">{level === 'late' ? 'Atrasado' : 'Demora'}</span>
      )}
    </span>
  )
}

interface Props {
  order: KitchenOrder
  now: Date
  tz: string
  prepMinutes: number
  warnMinutes: number
  lateMinutes: number
  isNew: boolean
  busy: boolean
  /** Finished orders render compact and without the advance button. */
  compact?: boolean
  onAdvance: (order: KitchenOrder) => void
  onPrint: (order: KitchenOrder) => void
  onSeen: (id: string) => void
}

/** A comanda on the board: the whole card can be dragged to the next column; the big button does the same in one tap. */
export function OrderCard({
  order,
  now,
  tz,
  prepMinutes,
  warnMinutes,
  lateMinutes,
  isNew,
  busy,
  compact = false,
  onAdvance,
  onPrint,
  onSeen,
}: Props) {
  const action = advanceAction(order)
  const draggable = dragTarget(order) !== null && !compact
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: order.id,
    disabled: !draggable,
  })
  const minutes = elapsedMinutes(order, now, prepMinutes)
  const level = compact ? 'ok' : timerLevel(minutes, warnMinutes, lateMinutes)
  const cash = cashToCollect(order)
  const waiting = order.status === 'received' || order.status === 'preparing'

  return (
    <article
      ref={setNodeRef}
      aria-label={`Pedido ${order.code}, ${typeLabel(order)}, ${order.customerName}`}
      data-testid="kitchen-card"
      data-code={order.code}
      data-status={order.status}
      onPointerEnter={() => {
        if (isNew) onSeen(order.id)
      }}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'relative rounded-lg border-2 bg-card p-4 shadow-chunk-sm',
        LEVEL_BORDER[level],
        isDragging && 'z-20 opacity-90 shadow-chunk',
        !isDragging && 'transition-shadow',
        compact && 'p-3',
      )}
    >
      {isNew && (
        <span className="absolute -top-3 left-3 rounded-full border-2 border-carbon bg-maiz px-3 py-0.5 font-display text-sm text-carbon">
          ¡Nuevo!
        </span>
      )}

      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            aria-label={`Arrastrar ${order.code} a la siguiente columna`}
            className="-ml-2 grid size-9 cursor-grab touch-none place-items-center rounded text-ink-soft hover:bg-ink/10 active:cursor-grabbing"
          >
            <GripVertical aria-hidden className="size-5" />
          </span>
        )}
        <h3 data-testid="card-code" className="font-mono text-2xl font-bold">
          {order.code}
        </h3>
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1 text-base font-bold">
          <TypeIcon order={order} />
          {typeLabel(order)}
        </span>
        {!compact && waiting && (
          <span className="ml-auto">
            <Elapsed minutes={minutes} level={level} />
          </span>
        )}
      </header>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-lg">
        <strong>{order.customerName}</strong>
        <a
          href={`tel:${order.customerPhone}`}
          className="inline-flex items-center gap-1 text-ink-soft underline-offset-2 hover:underline"
        >
          <Phone aria-hidden className="size-4" />
          {formatArPhone(order.customerPhone)}
        </a>
      </p>

      {order.scheduledFor && (
        <p className="mt-2 inline-flex items-center gap-2 rounded-md border-2 border-azulejo bg-azulejo/20 px-2 py-1 font-bold">
          <CalendarClock aria-hidden className="size-5" />
          Programado para las {formatClock(new Date(order.scheduledFor), tz)}
        </p>
      )}

      <ul className={cn('mt-3 space-y-2 border-t-2 border-dashed border-line pt-3', compact && 'space-y-1')}>
        {order.items.map((item) => (
          <li key={item.id}>
            <p className={cn('text-xl leading-tight font-bold', compact && 'text-base')}>
              <span className="mr-2 font-mono">{item.quantity}×</span>
              {item.name}
            </p>
            {item.modifiers.length > 0 && (
              <p className="pl-8 text-lg text-ink-soft">{item.modifiers.join(' · ')}</p>
            )}
            {item.note && (
              <p className="mt-1 ml-8 rounded-md border-2 border-carbon bg-maiz px-2 py-1 text-lg font-bold text-carbon">
                <span className="sr-only">Nota del cliente: </span>
                <span aria-hidden>NOTA: </span>
                {item.note}
              </p>
            )}
          </li>
        ))}
      </ul>

      {order.address && (
        <p className="mt-3 flex items-start gap-2 text-lg">
          <MapPin aria-hidden className="mt-1 size-5 shrink-0" />
          <span>{order.address}</span>
        </p>
      )}

      {cash && (
        <p className="mt-3 flex items-start gap-2 rounded-md border-2 border-nopal-claro p-2 text-lg font-bold">
          <Banknote aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            Cobrar {formatARS(cash.total)} en efectivo
            {cash.paidWith !== null && (
              <span className="block font-normal text-ink-soft">
                Paga con {formatARS(cash.paidWith)}
                {cash.change !== null && cash.change > 0 ? ` · vuelto ${formatARS(cash.change)}` : ''}
              </span>
            )}
          </span>
        </p>
      )}
      {order.paymentMethod === 'mercado_pago' && order.paymentStatus === 'paid' && (
        <p className="mt-3 text-base font-bold text-nopal-claro">Pagado con Mercado Pago</p>
      )}
      {order.paymentMethod === 'transfer' && order.paymentStatus === 'pending' && (
        <p className="mt-3 text-base font-bold text-maiz">
          Transferencia: confirmar que llegó {formatARS(order.total)}
        </p>
      )}

      <footer className="mt-4 flex gap-2">
        {action && !compact && (
          <Button
            size="xl"
            className="flex-1"
            loading={busy}
            onClick={() => {
              onAdvance(order)
            }}
          >
            {action.label}
          </Button>
        )}
        <Button
          variant="outline"
          size="xl"
          aria-label={`Imprimir comanda ${order.code}`}
          onClick={() => {
            onPrint(order)
          }}
          className={cn(compact && 'min-h-11 px-3')}
        >
          <Printer aria-hidden className="size-6" />
        </Button>
      </footer>
    </article>
  )
}
