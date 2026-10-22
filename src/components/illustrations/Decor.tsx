import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ---------------------------------------------------------------------------------------------- */
/* Papel picado: a string of cut-paper flags. Holes are real (even-odd) so any background shows.   */
/* ---------------------------------------------------------------------------------------------- */
const FLAG_COLORS = ['#C8102E', '#F2B33D', '#3F9A5E', '#E4007C', '#2C5BA3']
const FLAG_W = 38

function flagTile(): string {
  const hole = (cx: number, cy: number, r: number) =>
    `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0Z`
  const flags = FLAG_COLORS.map((color, i) => {
    const x = i * FLAG_W + 2
    return `<path fill="${color}" fill-rule="evenodd" d="M${x} 6h34v30l-8.5-6L${x + 17} 36l-8.5-6L${x} 36Z${hole(x + 17, 17, 4)}${hole(x + 7, 14, 2)}${hole(x + 27, 14, 2)}M${x + 12} 25l5-3 5 3-5 3Z"/>`
  }).join('')
  const w = FLAG_COLORS.length * FLAG_W
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="44" viewBox="0 0 ${w} 44"><path d="M0 5.5H${w}" stroke="#6B3E26" stroke-width="1.6"/>${flags}</svg>`
}
const FLAGS_URL = `url("data:image/svg+xml,${encodeURIComponent(flagTile())}")`

/** Decorative strip. It drifts slightly with the scroll unless the visitor prefers reduced motion. */
export function PapelPicado({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      el.style.backgroundPositionX = `${(-window.scrollY * 0.18).toFixed(1)}px`
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn('h-11 w-full bg-repeat-x', className)}
      style={{ backgroundImage: FLAGS_URL, backgroundSize: `${FLAG_COLORS.length * FLAG_W}px 44px` }}
    />
  )
}

/** Row of talavera tiles used as a divider or border. */
export function TalaveraStrip({ className }: { className?: string }) {
  return <div aria-hidden className={cn('talavera-strip', className)} />
}

/* ---------------------------------------------------------------------------------------------- */
/* Pizarrón: chalkboard behind the counter, in a wooden frame.                                      */
/* ---------------------------------------------------------------------------------------------- */
export function Pizarron({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-lg texture-wood p-2.5 shadow-chunk sm:p-3', className)} {...rest}>
      <div className="rounded-md texture-chalk p-4 shadow-[inset_0_0_24px_rgb(0_0_0/0.45)] sm:p-6">
        {children}
      </div>
    </div>
  )
}

/** Category title in chalk lettering with a hand-drawn underline. */
export function ChalkHeading({
  as: Tag = 'h2',
  children,
  className,
}: {
  as?: 'h2' | 'h3'
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3', className)}>
      <Tag className="font-chalk text-4xl leading-none text-tiza">{children}</Tag>
      <svg viewBox="0 0 220 10" className="mt-1 h-2.5 w-44 text-tiza/70" aria-hidden>
        <path
          d="M2 6C30 2 60 9 100 5S170 3 218 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
