import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'title'> {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  /** Right-aligned detail (price, time…). */
  aside?: ReactNode
}

/**
 * A native radio dressed as a card: keyboard/AT behaviour comes from the input, the card is just its label.
 * Spread react-hook-form's `register(name)` on it.
 */
export function RadioCard({ title, description, icon, aside, className, disabled, ...input }: Props) {
  const id = useId()
  return (
    <div className={className}>
      <input id={id} type="radio" disabled={disabled} className="peer sr-only" {...input} />
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 border-line bg-card p-3 transition-colors duration-150',
          'peer-checked:border-ink peer-checked:bg-ink/10 peer-checked:shadow-chunk-sm peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus hover:border-ink',
          'peer-disabled:cursor-not-allowed peer-disabled:opacity-55',
        )}
      >
        {icon && (
          <span aria-hidden className="shrink-0 text-ink-soft">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          {description && <span className="block text-sm text-ink-soft">{description}</span>}
        </span>
        {aside && <span className="shrink-0 font-mono text-sm tabular-nums">{aside}</span>}
      </label>
    </div>
  )
}
