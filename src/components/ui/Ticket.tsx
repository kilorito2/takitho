import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * "Tu comanda": thermal-paper receipt with a torn (CSS-mask) edge and mono numbers.
 * The wrapper carries the hard drop shadow because a mask would clip a box-shadow.
 */
export function Ticket({
  className,
  children,
  both = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { both?: boolean }) {
  return (
    <div className="drop-shadow-[3px_4px_0_rgb(0_0_0/0.28)]">
      <div
        className={cn(
          'texture-paper font-mono text-sm leading-snug text-carbon',
          both ? 'px-5 pt-7 pb-8 ticket-edge-both' : 'px-5 pt-5 pb-8 ticket-edge',
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </div>
  )
}

export function TicketTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-1 text-center font-display text-2xl tracking-wide">{children}</h2>
}

export function TicketDivider({ className }: { className?: string }) {
  return (
    <hr aria-hidden className={cn('my-3 border-0 border-t-2 border-dashed border-carbon/50', className)} />
  )
}

/** "Label ........ $ 1.500" — dotted leader between description and amount. */
export function TicketLine({
  label,
  value,
  strong = false,
  sub,
  className,
}: {
  label: ReactNode
  value?: ReactNode
  strong?: boolean
  sub?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('py-0.5', className)}>
      <div className={cn('flex items-baseline gap-2', strong && 'text-base font-bold')}>
        <span className="min-w-0 flex-1 wrap-break-word">{label}</span>
        {value !== undefined && (
          <>
            <span
              aria-hidden
              className="mb-1 h-0 min-w-4 flex-1 self-end border-b-2 border-dotted border-carbon/40"
            />
            <span className="shrink-0 tabular-nums">{value}</span>
          </>
        )}
      </div>
      {sub && <div className="pl-3 text-xs text-carbon/75">{sub}</div>}
    </div>
  )
}
