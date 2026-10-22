import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  selected?: boolean
  icon?: ReactNode
  count?: number
}

/** Toggle chip for filters and category tabs. Exposes its state with aria-pressed. */
export function Chip({
  selected = false,
  icon,
  count,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold whitespace-nowrap transition-colors duration-150',
        selected ? 'border-ink bg-ink text-paper-bg' : 'border-line bg-card text-ink hover:border-ink',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span className={cn('rounded-full px-1.5 text-xs', selected ? 'bg-paper-bg/20' : 'bg-ink/10')}>
          {count}
        </span>
      )}
    </button>
  )
}
