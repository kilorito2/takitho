import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'veggie' | 'spicy' | 'gluten' | 'promo' | 'muted'

// Every tone pairs a fill with text that passes AA (docs/BRAND.md §6) and carries a label,
// so colour is never the only signal.
const tones: Record<BadgeTone, string> = {
  neutral: 'border-line bg-card text-ink',
  veggie: 'border-transparent bg-nopal text-tortilla',
  spicy: 'border-transparent bg-chile text-tortilla',
  gluten: 'border-transparent bg-azulejo text-tortilla',
  promo: 'border-carbon bg-maiz text-carbon',
  muted: 'border-line bg-ink/10 text-ink-soft',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  icon?: ReactNode
}

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-5 font-bold',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  )
}
