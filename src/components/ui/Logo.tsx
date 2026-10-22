import { cn } from '@/lib/cn'

type LogoVariant = 'full' | 'stacked' | 'isotipo'

const SOURCES: Record<LogoVariant, { day: string; night: string; ratio: string }> = {
  full: { day: '/brand/logo-full.svg', night: '/brand/logo-mono-light.svg', ratio: '4 / 1' },
  stacked: { day: '/brand/logo-stacked.svg', night: '/brand/logo-stacked.svg', ratio: '1 / 1' },
  isotipo: { day: '/brand/isotipo.svg', night: '/brand/isotipo.svg', ratio: '1 / 1' },
}

/**
 * Brand mark. Day uses the full-colour logo; night swaps the horizontal one for the one-ink light
 * version (the coloured wordmark has a charcoal outline that disappears on charcoal).
 */
export function Logo({ variant = 'full', className }: { variant?: LogoVariant; className?: string }) {
  const src = SOURCES[variant]
  if (src.day === src.night) {
    return <img src={src.day} alt="Takitho" className={className} decoding="async" />
  }
  return (
    <>
      <img src={src.day} alt="Takitho" className={cn('dark:hidden', className)} decoding="async" />
      <img
        src={src.night}
        alt=""
        aria-hidden
        className={cn('hidden dark:block', className)}
        decoding="async"
      />
    </>
  )
}
