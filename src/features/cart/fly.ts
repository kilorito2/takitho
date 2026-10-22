// "Al agregar un producto, una miniatura vuela hasta la bandeja."
// Purpose: spatial consistency (shows where the item went). Tier: occasional. Tool: WAAPI on transform/opacity only,
// strong ease-out, 300 ms. With prefers-reduced-motion nothing flies: the cart badge just "bumps" gently.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const FLY_MS = 300

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Cart button (or any element) marked as the destination. */
export const CART_TARGET_ATTR = 'data-cart-target'

export function bumpCart(): void {
  const target = document.querySelector<HTMLElement>(`[${CART_TARGET_ATTR}]`)
  if (!target || typeof target.animate !== 'function') return
  const reduced = prefersReducedMotion()
  target.animate(
    reduced
      ? [{ opacity: 0.6 }, { opacity: 1 }]
      : [{ transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(1)' }],
    {
      duration: 220,
      easing: EASE_OUT,
    },
  )
}

/**
 * Fly a copy of `source` to the cart button. Resolves when finished; never throws and never blocks adding to the cart.
 * The clone is `aria-hidden`, pointer-events none, and removed afterwards.
 */
export async function flyToCart(source: Element | null): Promise<void> {
  const target = document.querySelector<HTMLElement>(`[${CART_TARGET_ATTR}]`)
  if (!source || !target || prefersReducedMotion() || typeof document.body.animate !== 'function') {
    bumpCart()
    return
  }
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  if (from.width === 0 || to.width === 0) {
    bumpCart()
    return
  }

  const ghost = document.createElement('div')
  ghost.setAttribute('aria-hidden', 'true')
  const img = source instanceof HTMLImageElement ? source : source.querySelector('img')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    borderRadius: '12px',
    pointerEvents: 'none',
    zIndex: '9999',
    overflow: 'hidden',
    background: img?.currentSrc ? `center / cover url("${img.currentSrc}")` : 'var(--color-maiz)',
    border: '2px solid var(--shadow-ink)',
    willChange: 'transform, opacity',
  })
  document.body.appendChild(ghost)

  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const scale = Math.min(0.25, to.width / from.width)
  try {
    await ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.35 },
      ],
      { duration: FLY_MS, easing: EASE_OUT, fill: 'forwards' },
    ).finished
  } catch {
    /* animation cancelled (e.g. navigation): nothing to do */
  } finally {
    ghost.remove()
  }
  bumpCart()
}
