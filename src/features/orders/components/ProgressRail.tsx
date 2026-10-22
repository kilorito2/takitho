import { Ticket, TicketDivider, TicketLine } from '@/components/ui/Ticket'
import { cn } from '@/lib/cn'
import { currentStepIndex, headline, minutesLeft, railSteps } from '../status'
import type { PublicOrder } from '@/types/api'
import { RailIcon } from './RailIcons'

/**
 * "La comanda colgada en el riel de la cocina": the order ticket hangs from a steel rail and the strip below shows the
 * stage it is in, from the comal to the moto (or the counter for pickup). Progress is never colour-only: every step
 * has a text label and `aria-current="step"` marks where the order is.
 */
export function ProgressRail({ order, now }: { order: PublicOrder; now: Date }) {
  const steps = railSteps(order.type)
  const index = currentStepIndex(order.status, order.type)
  const left = minutesLeft(order.created_at, order.estimated_minutes, order.status, now)
  const cancelled = order.status === 'cancelled'

  return (
    <section aria-label="Estado de tu pedido">
      {/* the rail */}
      <div
        aria-hidden
        className="relative mx-auto h-4 max-w-md rounded-full border-2 border-(--shadow-ink) bg-[linear-gradient(#9aa0a6,#5b6168)] shadow-chunk-sm"
      >
        <span className="absolute -bottom-3 left-[22%] h-5 w-3 rounded-b-sm border-2 border-(--shadow-ink) bg-[#5b6168]" />
        <span className="absolute right-[22%] -bottom-3 h-5 w-3 rounded-b-sm border-2 border-(--shadow-ink) bg-[#5b6168]" />
      </div>
      <div className="mx-auto max-w-md origin-top rotate-0 motion-safe:animate-[ticket-sway_5s_ease-in-out_infinite_alternate]">
        <Ticket both>
          <p className="text-center text-xs text-carbon/70">Comanda</p>
          <p data-testid="order-code" className="text-center font-mono text-4xl font-bold tracking-wider">
            {order.code}
          </p>
          <p className="mt-1 text-center font-display text-2xl">{headline(order.status, order.type)}</p>
          {left !== null && order.status !== 'pending_payment' && (
            <p className="text-center text-sm">{left > 0 ? `Listo en unos ${left} min` : 'Ya casi está'}</p>
          )}
          {order.scheduled_for && (
            <p className="text-center text-sm">
              Programado para{' '}
              {new Date(order.scheduled_for).toLocaleString('es-AR', {
                weekday: 'long',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Argentina/Buenos_Aires',
              })}
            </p>
          )}
          <TicketDivider />
          <ul className="space-y-0.5">
            {order.items.map((i, n) => (
              <li key={`${i.name}-${n}`}>
                <TicketLine
                  label={`${i.quantity} × ${i.name}`}
                  sub={
                    [i.modifiers.join(' · '), i.note ? `“${i.note}”` : ''].filter(Boolean).join(' — ') ||
                    undefined
                  }
                />
              </li>
            ))}
          </ul>
        </Ticket>
      </div>

      {cancelled ? (
        <p
          role="status"
          className="mx-auto mt-6 max-w-md rounded-md border-2 border-chile bg-chile/10 p-3 text-center font-bold"
        >
          Este pedido fue cancelado.
        </p>
      ) : (
        <ol className="mx-auto mt-6 flex max-w-md items-start justify-between gap-1" aria-label="Etapas">
          {steps.map((s, i) => {
            const state = index === null ? 'todo' : i < index ? 'done' : i === index ? 'current' : 'todo'
            return (
              <li
                key={s.key}
                aria-current={state === 'current' ? 'step' : undefined}
                className="relative flex flex-1 flex-col items-center text-center"
              >
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-5 right-1/2 h-0.5 w-full border-t-2 border-dashed',
                      state === 'todo' ? 'border-line' : 'border-ink',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 grid size-11 place-items-center rounded-full border-2 transition-colors duration-200',
                    state === 'done' && 'border-(--shadow-ink) bg-nopal text-tortilla',
                    state === 'current' && 'border-(--shadow-ink) bg-maiz text-carbon shadow-chunk-sm',
                    state === 'todo' && 'border-line bg-card text-ink-soft',
                  )}
                >
                  <RailIcon
                    step={s.key === 'ready' && order.type !== 'delivery' ? 'counter' : s.key}
                    className="size-7"
                  />
                </span>
                <span
                  className={cn(
                    'mt-1 text-xs leading-tight',
                    state === 'current' ? 'font-bold' : 'text-ink-soft',
                  )}
                >
                  {s.label}
                </span>
                <span className="sr-only">
                  {state === 'done' ? ', listo' : state === 'current' ? ', ahora' : ', pendiente'}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
