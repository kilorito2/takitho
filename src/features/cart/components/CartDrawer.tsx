import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Pencil, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Sheet } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/Button'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Ticket, TicketDivider, TicketLine, TicketTitle } from '@/components/ui/Ticket'
import { ApiError } from '@/lib/api'
import { formatARS } from '@/lib/money'
import { computeQuote } from '@/lib/pricing'
import { toPricingProducts } from '@/features/catalog/catalog'
import { useMenu, useStore } from '@/features/catalog/hooks'
import { buildOrderInput, useQuote } from '../quote'
import { blocking, revalidateCart } from '../revalidate'
import { cartCount, useCart } from '../store'
import { useUi } from '../ui'

/** "Tu comanda": the receipt. Totals come from the server (`quote-order`); a local preview fills the first moment. */
export function CartDrawer() {
  const open = useUi((s) => s.cartOpen)
  const setOpen = useUi((s) => s.setCartOpen)
  const openProduct = useUi((s) => s.openProduct)
  const { items, couponCode, setQuantity, remove, setCoupon } = useCart()
  const menu = useMenu()
  const store = useStore()
  const [codeInput, setCodeInput] = useState('')

  const catalogue = useMemo(() => (menu.data ? toPricingProducts(menu.data) : []), [menu.data])
  const views = useMemo(() => revalidateCart(items, catalogue), [items, catalogue])
  const problems = blocking(views)
  const changed = views.filter((v) => v.status === 'price_changed')

  const input = useMemo(
    () => (items.length > 0 ? buildOrderInput(items, { type: 'pickup', couponCode }) : null),
    [items, couponCode],
  )
  const quote = useQuote(open ? input : null)
  const quoteError = quote.error instanceof ApiError ? quote.error : null

  // Local preview (same pricing module as the server) so the receipt is never blank while the quote loads.
  const preview = useMemo(() => {
    if (items.length === 0 || catalogue.length === 0) return null
    const r = computeQuote({
      products: catalogue,
      lines: items.map((i) => ({ productId: i.productId, quantity: i.quantity, modifierIds: i.modifierIds })),
      orderType: 'pickup',
      now: new Date(),
      tz: store.data?.timezone ?? 'America/Argentina/Buenos_Aires',
    })
    return r.ok ? r.value : null
  }, [items, catalogue, store.data?.timezone])

  const subtotal = quote.data?.subtotal ?? preview?.subtotal ?? 0
  const discount = quote.data?.discount ?? 0
  const total = quote.data?.total ?? preview?.total ?? 0

  // An invalid coupon from the server is shown once and dropped so it cannot block the order.
  useEffect(() => {
    if (quoteError?.code === 'INVALID_COUPON' && couponCode) {
      setCoupon(null)
    }
  }, [quoteError, couponCode, setCoupon])

  const count = cartCount(items)

  return (
    <Sheet
      open={open}
      onClose={() => {
        setOpen(false)
      }}
      title="Tu comanda"
      hideTitle
    >
      {items.length === 0 ? (
        <div className="py-8 text-center">
          <p className="font-display text-3xl">Tu bandeja está vacía…</p>
          <p className="mt-1 text-lg text-ink-soft">y eso se arregla.</p>
          <Link
            to="/menu"
            onClick={() => {
              setOpen(false)
            }}
            className={`${buttonClasses({ size: 'lg' })} mt-6`}
          >
            Ver el menú
          </Link>
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          {(problems.length > 0 || changed.length > 0) && (
            <div role="alert" className="space-y-1 rounded-md border-2 border-chile bg-chile/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle aria-hidden className="size-4 text-brand-text" /> Cambió algo desde que armaste
                tu pedido
              </p>
              <ul className="list-disc pl-5">
                {[...problems, ...changed].map((v) => (
                  <li key={v.item.id}>{v.message}</li>
                ))}
              </ul>
            </div>
          )}

          <Ticket>
            <TicketTitle>Tu comanda</TicketTitle>
            <TicketDivider />
            <ul className="space-y-3">
              {views.map((v) => {
                const { item } = v
                const dead = v.status === 'removed' || v.status === 'unavailable' || v.status === 'invalid'
                return (
                  <li key={item.id} data-testid="cart-line" className={dead ? 'opacity-60' : undefined}>
                    <TicketLine
                      label={`${item.quantity} × ${item.snapshot.name}`}
                      value={formatARS(v.unitPrice * item.quantity)}
                      sub={
                        <>
                          {item.snapshot.modifierNames.length > 0 && (
                            <span>{item.snapshot.modifierNames.join(' · ')}</span>
                          )}
                          {item.note && <span className="block italic">“{item.note}”</span>}
                          {v.status === 'price_changed' && (
                            <span className="block font-bold text-chile">
                              Antes {formatARS(v.previousUnitPrice * item.quantity)}
                            </span>
                          )}
                          {dead && <span className="block font-bold text-chile">{v.message}</span>}
                        </>
                      }
                    />
                    <div className="mt-1 flex items-center gap-2 font-sans">
                      {!dead && (
                        <QuantityStepper
                          value={item.quantity}
                          onChange={(q) => {
                            setQuantity(item.id, q)
                          }}
                          label={`Cantidad de ${item.snapshot.name}`}
                        />
                      )}
                      {v.status !== 'removed' && !dead && (
                        <IconButton
                          aria-label={`Editar ${item.snapshot.name}`}
                          variant="outline"
                          onClick={() => {
                            setOpen(false)
                            openProduct(item.productId, item.id)
                          }}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </IconButton>
                      )}
                      <IconButton
                        aria-label={`Quitar ${item.snapshot.name}`}
                        variant="outline"
                        onClick={() => {
                          remove(item.id)
                        }}
                        className="ml-auto"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </IconButton>
                    </div>
                  </li>
                )
              })}
            </ul>
            <TicketDivider />
            <TicketLine label="Subtotal" value={formatARS(subtotal)} />
            {discount > 0 && quote.data?.coupon && (
              <TicketLine
                label={`Descuento · ${quote.data.coupon.label}`}
                value={`− ${formatARS(discount)}`}
              />
            )}
            <p className="text-xs text-carbon/70">El envío y la propina se suman en el último paso.</p>
            <TicketDivider />
            <TicketLine label="Total" value={formatARS(total)} strong />
          </Ticket>

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setCoupon(codeInput)
              setCodeInput('')
            }}
          >
            <div className="flex-1">
              <label htmlFor="coupon" className="mb-1 flex items-center gap-1.5 text-sm font-bold">
                <Tag aria-hidden className="size-4" /> ¿Tenés un cupón?
              </label>
              <input
                id="coupon"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value)
                }}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="BIENVENIDA10"
                className="min-h-11 w-full rounded-md border-2 border-line bg-card px-3 font-mono uppercase"
              />
            </div>
            <Button type="submit" variant="outline" disabled={!codeInput.trim()}>
              Aplicar
            </Button>
          </form>
          {couponCode && (
            <p className="flex items-center justify-between gap-2 rounded-md bg-nopal/15 px-3 py-2 text-sm">
              <span>
                Cupón <strong className="font-mono">{couponCode}</strong>{' '}
                {quote.data?.coupon ? 'aplicado' : 'en revisión…'}
              </span>
              <button
                type="button"
                aria-label="Quitar cupón"
                onClick={() => {
                  setCoupon(null)
                }}
                className="grid size-8 place-items-center rounded"
              >
                <X aria-hidden className="size-4" />
              </button>
            </p>
          )}
          {quoteError?.code === 'INVALID_COUPON' && (
            <p role="alert" className="text-sm font-bold text-brand-text">
              {quoteError.message}
            </p>
          )}

          <Link
            to="/checkout"
            onClick={() => {
              setOpen(false)
            }}
            aria-disabled={problems.length > 0}
            className={`${buttonClasses({ size: 'lg', block: true })} ${problems.length > 0 ? 'pointer-events-none opacity-50' : ''}`}
          >
            Pedir · {formatARS(total)} · {count} {count === 1 ? 'producto' : 'productos'}
          </Link>
          {problems.length > 0 && (
            <p className="text-center text-sm text-ink-soft">Quitá lo que se agotó para seguir.</p>
          )}
        </div>
      )}
    </Sheet>
  )
}
