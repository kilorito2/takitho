import { useEffect, useState } from 'react'
import { ProductSheet } from './ProductSheet'
import { useMenu } from '@/features/catalog/hooks'
import { useUi } from '../ui'

/**
 * Renders the product sheet from the shared UI state, so any page (menu, home, cart) can open it.
 * It stays mounted for the exit transition (260 ms) before releasing the product.
 */
export function ProductSheetHost() {
  const sheet = useUi((s) => s.sheet)
  const close = useUi((s) => s.closeProduct)
  const menu = useMenu()
  const [shown, setShown] = useState(sheet)
  // A newly opened sheet replaces what is shown right away (adjusting state while rendering, no effect needed).
  if (sheet && sheet !== shown) setShown(sheet)

  useEffect(() => {
    if (sheet) return
    const id = window.setTimeout(() => {
      setShown(null)
    }, 260)
    return () => {
      window.clearTimeout(id)
    }
  }, [sheet])

  const product = shown && menu.data ? menu.data.productsById[shown.productId] : undefined
  if (!shown || !menu.data || !product) return null
  return (
    <ProductSheet
      key={`${shown.productId}:${shown.lineId ?? 'new'}`}
      open={sheet !== null}
      menu={menu.data}
      product={product}
      lineId={shown.lineId}
      onClose={close}
    />
  )
}
