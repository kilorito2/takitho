import { ShoppingBasket } from 'lucide-react'
import { cartCount, useCart } from '../store'
import { CART_TARGET_ATTR } from '../fly'
import { useUi } from '../ui'

/** Header button that opens "Tu comanda". It is also the landing spot of the flying thumbnail. */
export function CartButton() {
  const count = useCart((s) => cartCount(s.items))
  const setCartOpen = useUi((s) => s.setCartOpen)
  return (
    <button
      type="button"
      {...{ [CART_TARGET_ATTR]: '' }}
      aria-label={
        count === 0 ? 'Tu bandeja, vacía' : `Tu bandeja, ${count} ${count === 1 ? 'producto' : 'productos'}`
      }
      onClick={() => {
        setCartOpen(true)
      }}
      className="relative grid size-11 place-items-center rounded-md border-2 border-(--shadow-ink) bg-maiz text-carbon shadow-chunk-sm transition-transform duration-150 ease-out active:translate-x-px active:translate-y-px"
    >
      <ShoppingBasket aria-hidden className="size-6" />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -top-2 -right-2 grid min-w-6 place-items-center rounded-full border-2 border-(--shadow-ink) bg-brand px-1 font-mono text-xs leading-5 font-bold text-on-brand"
        >
          {count}
        </span>
      )}
    </button>
  )
}
