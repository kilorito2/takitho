import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** A placeholder block. Decorative: group it in <SkeletonGroup> so assistive tech hears a single "loading". */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-md bg-ink/10 bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.28)_50%,transparent_70%)] bg-size-[200%_100%]',
        className,
      )}
      {...rest}
    />
  )
}

export function SkeletonGroup({
  label = 'Cargando…',
  className,
  children,
}: {
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
