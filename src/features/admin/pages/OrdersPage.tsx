import { useEffect, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/toastStore'
import { formatARS } from '@/lib/money'
import { ALL_STATUSES, type OrderStatus, type OrderType } from '@/lib/orderStatus'
import { useStore } from '@/features/catalog/hooks'
import { PageHeader } from '../components/PageHeader'
import { downloadText, toCsv } from '../csv'
import {
  METHOD_LABEL,
  ordersToCsvRows,
  PAYMENT_STATUS_LABEL,
  statusTone,
  STATUS_LABEL,
  TYPE_LABEL,
} from '../orders'
import { exportOrders, listOrders, PAGE_SIZE, type OrderFilters } from '../ordersApi'
import { presetRange } from '../ranges'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(value)
    }, ms)
    return () => {
      window.clearTimeout(id)
    }
  }, [value, ms])
  return debounced
}

const when = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))

const input = 'min-h-11 rounded-md border-2 border-line bg-card px-2'

export function OrdersPage() {
  const tz = useStore().data?.timezone ?? 'America/Argentina/Buenos_Aires'
  const initial = useMemo(() => presetRange('7d', new Date(), tz), [tz])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [type, setType] = useState<OrderType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const term = useDebounced(search, 300)

  const filters: OrderFilters = { from, to, status, type, search: term }
  const orders = useQuery({
    queryKey: ['admin', 'orders', filters, page],
    queryFn: () => listOrders(filters, page),
    placeholderData: keepPreviousData,
    enabled: to >= from,
  })
  const total = orders.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const reset = () => {
    setPage(0)
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const { rows, truncated } = await exportOrders(filters)
      downloadText(`pedidos-${from}_a_${to}.csv`, toCsv(ordersToCsvRows(rows, tz)))
      toast.success(
        truncated
          ? 'Exportamos los primeros 5.000 pedidos: achicá el período para ver el resto.'
          : `Exportamos ${rows.length} pedidos.`,
      )
    } catch {
      toast.error('No se pudo exportar. Probá de nuevo.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Todos los pedidos por día de negocio. Entrá a uno para ver el detalle, cancelarlo o marcarlo como cobrado."
        actions={
          <Button
            variant="outline"
            loading={exporting}
            leadingIcon={<Download aria-hidden className="size-5" />}
            onClick={() => void exportCsv()}
          >
            Exportar CSV
          </Button>
        }
      />

      <form
        role="search"
        aria-label="Filtrar pedidos"
        onSubmit={(e) => {
          e.preventDefault()
        }}
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="lg:col-span-2">
          <span className="block font-bold">Buscar</span>
          <input
            type="search"
            value={search}
            placeholder="Código, nombre o teléfono"
            onChange={(e) => {
              setSearch(e.target.value)
              reset()
            }}
            className={`${input} w-full`}
          />
        </label>
        <label>
          <span className="block font-bold">Desde</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value)
              reset()
            }}
            className={`${input} w-full`}
          />
        </label>
        <label>
          <span className="block font-bold">Hasta</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value)
              reset()
            }}
            className={`${input} w-full`}
          />
        </label>
        <label>
          <span className="block font-bold">Estado</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(ALL_STATUSES.find((s) => s === e.target.value) ?? 'all')
              reset()
            }}
            className={`${input} w-full`}
          >
            <option value="all">Todos</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block font-bold">Tipo</span>
          <select
            value={type}
            onChange={(e) => {
              setType(
                e.target.value === 'pickup' || e.target.value === 'delivery' || e.target.value === 'dine_in'
                  ? e.target.value
                  : 'all',
              )
              reset()
            }}
            className={`${input} w-full`}
          >
            <option value="all">Todos</option>
            {(Object.keys(TYPE_LABEL) as OrderType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
      </form>

      {orders.isError && (
        <p role="alert" className="font-bold text-brand-text">
          No pudimos cargar los pedidos.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border-2 border-line bg-card">
        <table className="w-full min-w-[44rem] text-left">
          <caption className="sr-only">Pedidos del período</caption>
          <thead className="border-b-2 border-line bg-ink/5">
            <tr>
              {['Pedido', 'Cuándo', 'Cliente', 'Tipo', 'Pago', 'Estado', 'Total'].map((h, i) => (
                <th key={h} scope="col" className={`px-3 py-2 ${i === 6 ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.data?.rows.map((o) => (
              <tr key={o.id} className="border-t border-line hover:bg-ink/5">
                <th scope="row" className="px-3 py-2 font-mono">
                  <Link to={`/admin/pedidos/${o.id}`} className="underline underline-offset-2">
                    {o.code}
                  </Link>
                </th>
                <td className="px-3 py-2 whitespace-nowrap">{when(o.createdAt, tz)}</td>
                <td className="px-3 py-2">{o.customerName}</td>
                <td className="px-3 py-2">{TYPE_LABEL[o.type]}</td>
                <td className="px-3 py-2">
                  {METHOD_LABEL[o.paymentMethod]} · {PAYMENT_STATUS_LABEL[o.paymentStatus].toLowerCase()}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatARS(o.total)}</td>
              </tr>
            ))}
            {orders.data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-soft">
                  No hay pedidos con esos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-ink-soft">
          {total} {total === 1 ? 'pedido' : 'pedidos'} · página {page + 1} de {pages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 0}
            aria-label="Página anterior"
            onClick={() => {
              setPage((p) => p - 1)
            }}
          >
            <ChevronLeft aria-hidden className="size-5" />
          </Button>
          <Button
            variant="outline"
            disabled={page + 1 >= pages}
            aria-label="Página siguiente"
            onClick={() => {
              setPage((p) => p + 1)
            }}
          >
            <ChevronRight aria-hidden className="size-5" />
          </Button>
        </div>
      </nav>
    </>
  )
}
