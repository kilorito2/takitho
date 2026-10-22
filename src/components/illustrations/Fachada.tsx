import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/cn'
import { facadeLiveCss, facadeMarkup } from './facadeMarkup'

/**
 * Hero storefront. The SVG markup is trusted, static output of facadeMarkup() (no user input).
 * - day/night come from CSS variables (see facadeLiveCss), so the sign turns neon with the theme;
 * - the papel picado follows the scroll through `--sway`;
 * - the ABIERTO/CERRADO sign flips in real 3D according to `open`.
 */
export function Fachada({ open, className }: { open: boolean; className?: string }) {
  const markup = useMemo(() => facadeMarkup(), [])
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      el.style.setProperty('--sway', (Math.sin(window.scrollY / 70) * 7).toFixed(2))
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
    <div ref={root} className={cn('tk-facade', className)}>
      <style href="tk-facade-theme" precedence="default">
        {facadeLiveCss()}
      </style>
      <svg
        viewBox="0 0 640 480"
        role="img"
        aria-label="Fachada de Takitho: letrero, toldo a rayas, ventana con macetas y papel picado"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      <OpenSign open={open} />
    </div>
  )
}

export function OpenSign({ open }: { open: boolean }) {
  return (
    <div className="tk-open-sign" data-open={open} role="status">
      <span className="sr-only">{open ? 'Local abierto' : 'Local cerrado'}</span>
      <div className="tk-open-sign__inner" aria-hidden>
        <span className="tk-open-sign__face tk-open-sign__face--open">ABIERTO</span>
        <span className="tk-open-sign__face tk-open-sign__face--closed">CERRADO</span>
      </div>
    </div>
  )
}
