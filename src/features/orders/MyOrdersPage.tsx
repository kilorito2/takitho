import { Link, useNavigate } from 'react-router'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { formatARS } from '@/lib/money'
import { useMyOrders } from '@/features/cart/myOrders'
import { useCart } from '@/features/cart/store'
import { useUi } from '@/features/cart/ui'
import { usePageMeta } from '@/lib/seo'

const TYPE = { pickup: 'Retiro', delivery: 'Delivery', dine_in: 'Mesa' } as const

const when = (iso: string): string =>
  new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })

/** "Mis pedidos": only what was ordered from this device (no accounts, ADR-0003). */
export function MyOrdersPage() {
  usePageMeta({ title: 'Mis pedidos', noindex: true })
  const orders = useMyOrders((s) => s.orders)
  const remove = useMyOrders((s) => s.remove)
  const load = useCart((s) => s.load)
  const setCartOpen = useUi((s) => s.setCartOpen)
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-4xl">Mis pedidos</h1>
      <p className="mb-6 text-ink-soft">Los guardamos en este celular, sin necesidad de cuenta.</p>

      {orders.length === 0 ? (
        <div className="rounded-md border-2 border-dashed border-line p-8 text-center">
          <p className="font-chalk text-3xl">Todavía no pediste nada…</p>
          <p className="mt-1 text-ink-soft">Cuando pidas, tu historial aparece acá.</p>
          <Link to="/menu" className={`${buttonClasses({ size: 'lg' })} mt-5`}>
            Ver el menú
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.code} className="rounded-md border-2 border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xl font-bold">{o.code}</p>
                  <p className="text-sm text-ink-soft">
                    {when(o.createdAt)} · {TYPE[o.type]}
                  </p>
                </div>
                <p className="font-display text-xl">{formatARS(o.total)}</p>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-ink-soft">
                {o.items.map((i) => `${i.quantity} × ${i.snapshot.name}`).join(', ')}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to={`/pedido/${encodeURIComponent(o.code)}?t=${encodeURIComponent(o.token)}`}
                  className={buttonClasses({ variant: 'primary' })}
                >
                  Ver estado
                </Link>
                {o.items.length > 0 && (
                  <Button
                    variant="outline"
                    leadingIcon={<RotateCcw aria-hidden className="size-4" />}
                    onClick={() => {
                      load(o.items)
                      setCartOpen(true)
                      void navigate('/menu')
                    }}
                  >
                    Repetir
                  </Button>
                )}
                <button
                  type="button"
                  aria-label={`Sacar ${o.code} de mi historial`}
                  onClick={() => {
                    remove(o.code)
                  }}
                  className="ml-auto grid size-11 place-items-center rounded-md text-ink-soft hover:bg-ink/10"
                >
                  <Trash2 aria-hidden className="size-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
