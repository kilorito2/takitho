import { cn } from '@/lib/cn'

/** Hand-drawn chile pepper (own SVG, not a stock icon). */
function Chile({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        d="M5.2 7.4C7.4 4.2 12.8 4.4 15.6 8.2c3.4 4.6 4.6 8.8 5.2 12.6-5.2-.2-10.6-2.2-13.6-6.4C5.2 11.8 4.4 9.6 5.2 7.4Z"
        fill={filled ? 'var(--color-chile)' : 'none'}
        stroke={filled ? 'var(--color-carbon)' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity={filled ? 1 : 0.45}
      />
      <path
        d="M5.4 7.2C3.8 6.4 3.2 4.8 4.4 3.4"
        fill="none"
        stroke={filled ? 'var(--color-nopal)' : 'currentColor'}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity={filled ? 1 : 0.45}
      />
    </svg>
  )
}

const LABELS = ['Sin picante', 'Picante suave', 'Picante medio', 'Muy picante'] as const

/** Heat level 0–3 shown as chiles, with a text alternative. */
export function SpiceLevel({
  level,
  className,
  showLabel = false,
}: {
  level: 0 | 1 | 2 | 3
  className?: string
  showLabel?: boolean
}) {
  const label = LABELS[level]
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-ink-soft', className)}
      role="img"
      aria-label={`${label}: ${level} de 3`}
    >
      {[1, 2, 3].map((n) => (
        <Chile key={n} filled={n <= level} />
      ))}
      {showLabel && <span className="ml-1 text-xs font-bold">{label}</span>}
    </span>
  )
}
