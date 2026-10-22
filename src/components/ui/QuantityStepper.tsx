import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Spoken name, e.g. "Cantidad de Tacos al pastor". */
  label: string
  className?: string
}

/** − 2 + stepper with 44 px targets; the value is announced politely when it changes. */
export function QuantityStepper({ value, onChange, min = 1, max = 20, label, className }: Props) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center gap-1 rounded-md border-2 border-line bg-card', className)}
    >
      <IconButton
        aria-label="Uno menos"
        disabled={value <= min}
        onClick={() => {
          onChange(value - 1)
        }}
        className="size-11"
      >
        <Minus aria-hidden className="size-5" />
      </IconButton>
      <output aria-live="polite" className="min-w-8 text-center font-mono text-lg font-bold tabular-nums">
        {value}
      </output>
      <IconButton
        aria-label="Uno más"
        disabled={value >= max}
        onClick={() => {
          onChange(value + 1)
        }}
        className="size-11"
      >
        <Plus aria-hidden className="size-5" />
      </IconButton>
    </div>
  )
}
