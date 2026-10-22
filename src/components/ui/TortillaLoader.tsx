import { cn } from '@/lib/cn'

/** Loading state: a tortilla puffing up on the comal. Announces itself once to assistive tech. */
export function TortillaLoader({
  label = 'Calentando el comal…',
  size = 96,
  className,
}: {
  label?: string
  size?: number
  className?: string
}) {
  return (
    <div role="status" className={cn('flex flex-col items-center gap-3', className)}>
      <svg width={size} height={size * 0.82} viewBox="0 0 120 98" aria-hidden>
        {/* comal (flat griddle) */}
        <ellipse cx="60" cy="74" rx="52" ry="17" fill="#1e1a17" />
        <ellipse cx="60" cy="70" rx="48" ry="14" fill="#3a322d" />
        <path d="M104 66l14-5" stroke="#1e1a17" strokeWidth="7" strokeLinecap="round" />
        {/* tortilla */}
        <g className="origin-[60px_70px] animate-comal motion-reduce:animate-none">
          <ellipse cx="60" cy="58" rx="34" ry="24" fill="#f6d58a" stroke="#1e1a17" strokeWidth="3.5" />
          <ellipse cx="48" cy="52" rx="5" ry="3.2" fill="#a9652f" opacity=".75" />
          <ellipse cx="72" cy="62" rx="6" ry="3.6" fill="#a9652f" opacity=".75" />
          <ellipse cx="66" cy="48" rx="3.5" ry="2.4" fill="#a9652f" opacity=".7" />
        </g>
        {/* steam */}
        <path
          d="M44 30q-5-6 0-12M60 26q-5-6 0-12M76 30q-5-6 0-12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity=".45"
        />
      </svg>
      <p className="font-chalk text-2xl text-ink-soft">{label}</p>
    </div>
  )
}
