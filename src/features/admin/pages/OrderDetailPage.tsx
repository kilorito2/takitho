import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Ban, Banknote, ExternalLink, MessageCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Dialog'
import { TextAreaField } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { formatARS } from '@/lib/money'
import { isTerminal } from '@/lib/orderStatus'
import { formatArPhone } from '@/lib/phone'
import { useStore } from '@/features/catalog/hooks'
import { Panel } from '../components/PageHeader'
import { METHOD_LABEL, PAYMENT_STATUS_LABEL, statusTone, STATUS_LABEL, TYPE_LABEL } from '../orders'
import { fetchOrderDetail, markPaid, moveOrder } from '../ordersApi'

const stamp = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso))

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const tz = useStore().data?.timezone ?? 'America/Argentina/Buenos_Aires'
  const queryClient = useQueryClient()
  const key = ['admin', 'order', id] as const
  const order = useQuery({ queryKey: key, queryFn: () => fetchOrderDetail(id), enabled: id !== '' })
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  const cancel = useMutation({
    mutationFn: () => moveOrder(id, 'cancelled', reason.trim()),
    onSuccess: async () => {
      setCancelling(false)
      setReason('')
      toast.success('Pedido cancelado.')
      await refresh()
    },
    onError: () => toast.error('No se pudo cancelar. Puede que el pedido ya haya cambiado de estado.'),
  })
  const pay = useMutation({
    mutationFn: () => markPaid(id),
    onSuccess: async () => {
      toast.success('Marcado como cobrado.')
      await refresh()
    },
    onError: () => toast.error('No se pudo marcar como cobrado.'),
  })

  if (order.isPending) return <Skeleton className="h-96" />
  const o = order.data
  if (!o) {
    return (
      <div>
        <p className="text-xl font-bold">No encontramos ese pedido.</p>
        <Link to="/admin/pedidos" className="underline">
          Volver a pedidos
        </Link>
      </div>
    )
  }

  const address = [o.delivery_street, o.delivery_number].filter(Boolean).join(' ')
  const canCancel = !isTerminal(o.status)
  const canMarkPaid =
    o.payment_status === 'pending' && o.payment_method !== 'mercado_pago' && o.status !== 'cancelled'
  const digits = o.customer_phone.replace(/\D/g, '')
  const history = [...o.order_status_history].sort((a, b) => a.created_at.localeCompare(b.created_at))

  return (
    <>
      <Link
        to="/admin/pedidos"
        className="mb-4 inline-flex min-h-11 items-center gap-1 font-bold underline-offset-2 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-5" /> Pedidos
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl md:text-4xl">{o.code}</h1>
          <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
          <span className="text-ink-soft">
            {TYPE_LABEL[o.type]}
            {o.type === 'dine_in' && o.tables ? ` ${o.tables.number}` : ''} · {stamp(o.created_at, tz)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canMarkPaid && (
            <Button
              variant="secondary"
              loading={pay.isPending}
              leadingIcon={<Banknote aria-hidden className="size-5" />}
              onClick={() => {
                pay.mutate()
              }}
            >
              Marcar como cobrado
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              leadingIcon={<Ban aria-hidden className="size-5" />}
              onClick={() => {
                setCancelling(true)
              }}
            >
              Cancelar pedido
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Panel title="Productos">
            <ul className="divide-y-2 divide-dashed divide-line">
              {[...o.order_items]
                .sort((a, b) => a.sort - b.sort)
                .map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 py-2">
                    <div>
                      <p className="font-bold">
                        {i.quantity}× {i.name_snapshot}
                      </p>
                      {i.order_item_modifiers.length > 0 && (
                        <p className="text-ink-soft">
                          {i.order_item_modifiers.map((m) => m.name_snapshot).join(' · ')}
                        </p>
                      )}
                      {i.note && (
                        <p className="mt-1 rounded border-2 border-ink bg-maiz px-2 py-0.5 text-carbon">
                          Nota: {i.note}
                        </p>
                      )}
                    </div>
                    <span className="tabular-nums">{formatARS(i.line_total)}</span>
                  </li>
                ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t-2 border-line pt-3">
              <Row label="Subtotal" value={formatARS(o.subtotal)} />
              {o.discount > 0 && <Row label="Descuento" value={`− ${formatARS(o.discount)}`} />}
              {o.delivery_fee > 0 && <Row label="Envío" value={formatARS(o.delivery_fee)} />}
              {o.tip > 0 && <Row label="Propina" value={formatARS(o.tip)} />}
              <Row label="Total" value={formatARS(o.total)} strong />
            </dl>
          </Panel>

          <Panel title="Historial">
            <ol className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3">
                  <time className="font-mono text-sm text-ink-soft">{stamp(h.created_at, tz)}</time>
                  <span className="font-bold">{STATUS_LABEL[h.to_status]}</span>
                  {h.reason && <span className="text-ink-soft">· {h.reason}</span>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Cliente">
            <p className="font-bold">{o.customer_name}</p>
            <p>{formatArPhone(o.customer_phone)}</p>
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold underline underline-offset-2"
            >
              <MessageCircle aria-hidden className="size-5" /> Escribirle por WhatsApp
            </a>
            {o.type === 'delivery' && (
              <div className="mt-3 border-t-2 border-line pt-3">
                <p className="font-bold">{o.delivery_zones?.name ?? 'Delivery'}</p>
                <p>{address}</p>
                {o.delivery_floor_apt && <p>{o.delivery_floor_apt}</p>}
                {o.delivery_references && <p className="text-ink-soft">{o.delivery_references}</p>}
              </div>
            )}
            {o.scheduled_for && (
              <p className="mt-3 border-t-2 border-line pt-3 font-bold">
                Programado para {stamp(o.scheduled_for, tz)}
              </p>
            )}
          </Panel>

          <Panel title="Pago">
            <p className="font-bold">{METHOD_LABEL[o.payment_method]}</p>
            <p>
              {PAYMENT_STATUS_LABEL[o.payment_status]}
              {o.paid_at ? ` · ${stamp(o.paid_at, tz)}` : ''}
            </p>
            {o.cash_paid_with !== null && (
              <p className="text-ink-soft">Paga con {formatARS(o.cash_paid_with)}</p>
            )}
            {o.cancel_reason && (
              <p className="mt-2 text-brand-text">Motivo de cancelación: {o.cancel_reason}</p>
            )}
          </Panel>

          <a
            href={`/pedido/${o.code}?t=${o.public_token}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 font-bold underline underline-offset-2"
          >
            <ExternalLink aria-hidden className="size-5" /> Ver como lo ve el cliente
          </a>
        </div>
      </div>

      <Modal
        open={cancelling}
        onClose={() => {
          setCancelling(false)
        }}
        title={`Cancelar ${o.code}`}
        description="El cliente ve el pedido como cancelado y el cupón, si usó uno, vuelve a estar disponible. Si ya pagó con Mercado Pago, el reembolso se hace desde Mercado Pago."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (reason.trim().length >= 3) cancel.mutate()
          }}
        >
          <TextAreaField
            label="Motivo"
            value={reason}
            required
            minLength={3}
            maxLength={200}
            onChange={(e) => {
              setReason(e.target.value)
            }}
            hint="Queda registrado en el historial."
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCancelling(false)
              }}
            >
              Volver
            </Button>
            <Button type="submit" loading={cancel.isPending} disabled={reason.trim().length < 3}>
              Cancelar pedido
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-bold' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
