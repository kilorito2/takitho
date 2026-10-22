import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { Copy, CreditCard, MessageCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { ApiError } from '@/lib/api'
import { api } from '@/lib/client'
import { formatARS } from '@/lib/money'
import { whatsappLink } from '@/lib/links'
import { useMyOrders } from '@/features/cart/myOrders'
import { useCart } from '@/features/cart/store'
import { useUi } from '@/features/cart/ui'
import { useNow } from '@/features/catalog/hooks'
import type { MpPreferenceResponse } from '@/types/api'
import { ProgressRail } from './components/ProgressRail'
import { announcement } from './status'
import { useOrder } from './useOrder'
import { orderMessage } from './whatsapp'
import { usePageMeta } from '@/lib/seo'

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copiado`)
  } catch {
    toast.error('No pudimos copiarlo', { description: 'Seleccionalo y copialo a mano.' })
  }
}

/** /pedido/:codigo?t=<token> — confirmation and live tracking. */
export function TrackingPage() {
  const { codigo = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tokenParam = params.get('t')
  const saved = useMyOrders((s) => s.orders.find((o) => o.code.toLowerCase() === codigo.toLowerCase()))
  const token = tokenParam ?? saved?.token ?? null
  const query = useOrder(codigo, token)
  const now = useNow(30_000)
  const load = useCart((s) => s.load)
  const setCartOpen = useUi((s) => s.setCartOpen)
  const [retrying, setRetrying] = useState(false)

  const order = query.data
  usePageMeta({ title: `Pedido ${codigo.toUpperCase()}`, noindex: true })

  // Arrived without the secret link: if this device made the order we know the token, otherwise explain.
  if (!tokenParam && saved)
    return (
      <Navigate
        replace
        to={`/pedido/${encodeURIComponent(saved.code)}?t=${encodeURIComponent(saved.token)}`}
      />
    )
  if (!token) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-3xl">Entrá con el link de tu pedido</h1>
        <p className="mt-2 text-ink-soft">
          Por seguridad, el seguimiento se abre con el link que te dimos al confirmar. Si hiciste el pedido
          desde este celular, lo encontrás en “Mis pedidos”.
        </p>
        <Link to="/mis-pedidos" className={`${buttonClasses({ size: 'lg' })} mt-6`}>
          Ir a mis pedidos
        </Link>
      </section>
    )
  }

  if (query.isPending) {
    return (
      <SkeletonGroup label="Buscando tu pedido…" className="mx-auto max-w-md space-y-4 px-4 py-10">
        <Skeleton className="h-6" />
        <Skeleton className="h-64" />
        <Skeleton className="h-16" />
      </SkeletonGroup>
    )
  }
  if (query.error instanceof ApiError && query.error.code === 'NOT_FOUND') {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
        <h1 className="text-3xl">No encontramos ese pedido</h1>
        <p className="mt-2 text-ink-soft">
          Revisá que el link esté completo. Si el problema sigue, escribinos.
        </p>
        <Link to="/mis-pedidos" className={`${buttonClasses({ size: 'lg' })} mt-6`}>
          Mis pedidos
        </Link>
      </section>
    )
  }
  if (!order) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
        <h1 className="text-3xl">Se cortó la señal</h1>
        <p className="mt-2 text-ink-soft">No pudimos traer el estado de tu pedido.</p>
        <Button className="mt-6" size="lg" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </section>
    )
  }

  const wa = whatsappLink(order.store.whatsapp, orderMessage(order, saved ? undefined : undefined))
  const payNow = order.payment_method === 'mercado_pago' && order.status === 'pending_payment'
  const showMpError = params.get('pago') === 'error'

  const retryPayment = async () => {
    setRetrying(true)
    try {
      const pref = await api().call<MpPreferenceResponse>('create-mp-preference', {
        order_code: order.code,
        public_token: token,
      })
      window.location.assign(pref.init_point)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No pudimos abrir Mercado Pago.')
      setRetrying(false)
    }
  }

  const repeat = () => {
    if (!saved || saved.items.length === 0) return
    load(saved.items)
    setCartOpen(true)
    void navigate('/menu')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="sr-only">Seguimiento de tu pedido {order.code}</h1>
      {/* One polite announcement per change, for screen readers. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement(order.status, order.type)}
      </p>

      <ProgressRail order={order} now={now} />

      <div className="mx-auto mt-8 max-w-md space-y-4">
        {payNow && (
          <div className="rounded-md border-2 border-(--shadow-ink) bg-maiz p-4 text-carbon">
            <p className="font-bold">
              {showMpError ? 'No pudimos abrir Mercado Pago.' : 'Tu pedido espera el pago.'}
            </p>
            <p className="text-sm">
              Si ya pagaste, quedate un momento: lo confirmamos solos. Si no, pagá acá.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => void retryPayment()}
              loading={retrying}
              leadingIcon={<CreditCard aria-hidden className="size-5" />}
            >
              Pagar con Mercado Pago
            </Button>
          </div>
        )}

        {order.transfer && (
          <section aria-labelledby="transfer" className="rounded-md border-2 border-line bg-card p-4">
            <h2 id="transfer" className="font-display text-xl">
              Transferí {formatARS(order.total)}
            </h2>
            <ul className="mt-2 space-y-2">
              {(
                [
                  ['Alias', order.transfer.alias],
                  ['CBU / CVU', order.transfer.cbu],
                ] as const
              ).map(([label, value]) => (
                <li key={label} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-ink-soft">{label}</p>
                    <p className="font-mono font-bold break-all">{value}</p>
                  </div>
                  <Button
                    variant="outline"
                    aria-label={`Copiar ${label}`}
                    onClick={() => void copy(value, label)}
                    leadingIcon={<Copy aria-hidden className="size-4" />}
                  >
                    Copiar
                  </Button>
                </li>
              ))}
              <li className="text-sm text-ink-soft">Titular: {order.transfer.holder}</li>
            </ul>
          </section>
        )}

        <div className="rounded-md border-2 border-line bg-card p-4">
          <dl>
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="font-mono tabular-nums">{formatARS(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between">
                <dt>Descuento</dt>
                <dd className="font-mono tabular-nums">− {formatARS(order.discount)}</dd>
              </div>
            )}
            {order.delivery_fee > 0 && (
              <div className="flex justify-between">
                <dt>Envío</dt>
                <dd className="font-mono tabular-nums">{formatARS(order.delivery_fee)}</dd>
              </div>
            )}
            {order.tip > 0 && (
              <div className="flex justify-between">
                <dt>Propina</dt>
                <dd className="font-mono tabular-nums">{formatARS(order.tip)}</dd>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t-2 border-line pt-1 font-bold">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{formatARS(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-ink-soft">
            Pago:{' '}
            {order.payment_method === 'mercado_pago'
              ? 'Mercado Pago'
              : order.payment_method === 'cash'
                ? 'Efectivo'
                : 'Transferencia'}{' '}
            ·{' '}
            {order.payment_status === 'paid'
              ? 'pagado'
              : order.payment_status === 'failed'
                ? 'falló'
                : order.payment_status === 'refunded'
                  ? 'reembolsado'
                  : 'pendiente'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: 'secondary', size: 'lg' })}
            >
              <MessageCircle aria-hidden className="size-5" /> Avisar al local por WhatsApp
            </a>
          )}
          {saved && saved.items.length > 0 && (
            <Button
              variant="outline"
              size="lg"
              onClick={repeat}
              leadingIcon={<RotateCcw aria-hidden className="size-5" />}
            >
              Repetir pedido
            </Button>
          )}
          <Link to="/mis-pedidos" className={buttonClasses({ variant: 'ghost', size: 'lg' })}>
            Mis pedidos
          </Link>
        </div>
      </div>
    </div>
  )
}
