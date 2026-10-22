import type { RailStep } from '../status'

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Hand-drawn icons for the kitchen rail: ticket → comal → bolsa / mostrador → moto → plato. */
export function RailIcon({ step, className }: { step: RailStep | 'counter'; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      {step === 'received' && (
        <g {...STROKE}>
          <path d="M12 6h24v36l-4-3-4 3-4-3-4 3-4-3-4 3Z" />
          <path d="M18 16h12M18 23h12M18 30h7" />
        </g>
      )}
      {step === 'preparing' && (
        <g {...STROKE}>
          <ellipse cx="22" cy="32" rx="17" ry="6" />
          <path d="M38 31l8-3" />
          <path d="M12 26q10-9 20 0" />
          <path d="M16 15q-3-4 0-8M24 13q-3-4 0-8M32 15q-3-4 0-8" opacity=".7" />
        </g>
      )}
      {step === 'ready' && (
        <g {...STROKE}>
          <path d="M10 18h28l-3 24H13Z" />
          <path d="M17 18v-4a7 7 0 0 1 14 0v4" />
          <path d="M20 28h8" />
        </g>
      )}
      {step === 'counter' && (
        <g {...STROKE}>
          <path d="M6 30h36v12H6Z" />
          <path d="M10 30v-4M38 30v-4" />
          <path d="M16 24a8 8 0 0 1 16 0Z" />
          <path d="M24 16v-3M21 13h6" />
        </g>
      )}
      {step === 'on_the_way' && (
        <g {...STROKE}>
          <circle cx="11" cy="34" r="6" />
          <circle cx="37" cy="34" r="6" />
          <path d="M11 34h8l6-12h8l4 12" />
          <path d="M31 22l-2-6h5" />
          <path d="M19 34l4-12" />
        </g>
      )}
      {step === 'delivered' && (
        <g {...STROKE}>
          <circle cx="24" cy="26" r="14" />
          <path d="M17 26l5 5 9-10" />
          <path d="M8 8l4 4M40 8l-4 4" opacity=".7" />
        </g>
      )}
    </svg>
  )
}
