import { ShoppingBasket } from 'lucide-react'
import { formatARS } from '@/lib/money'
import { cartCount, useCart } from '../store'
import { useUi } from '../ui'

/** Phone-only bottom bar on the menu: the order is one tap away while scrolling. */
export function CartBar() {
  const items = useCart((s) => s.items)
  const setCartOpen = useUi((s) => s.setCartOpen)
  if (items.length === 0) return null
  const count = cartCount(items)
  const approx = items.reduce((sum, i) => sum + i.snapshot.unitPrice * i.quantity, 0)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <button
        type="button"
        onClick={() => {
          setCartOpen(true)
        }}
        className="pointer-events-auto flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border-2 border-(--shadow-ink) bg-brand px-4 text-on-brand shadow-chunk"
      >
        <span className="flex items-center gap-2 font-display text-lg">
          <ShoppingBasket aria-hidden className="size-5" /> Ver tu comanda · {count}
        </span>
        <span className="font-display text-lg">{formatARS(approx)}</span>
      </button>
    </div>
  )
}
