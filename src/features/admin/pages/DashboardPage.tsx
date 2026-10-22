import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { formatARS } from '@/lib/money'
import { cn } from '@/lib/cn'
import { useStore } from '@/features/catalog/hooks'
import { PageHeader, Panel } from '../components/PageHeader'
import { alertsKey, fetchAlerts, fetchDashboard, resolveAlert, type Dashboard } from '../api'
import {
  change,
  presetRange,
  previousRange,
  PRESETS,
  shortDay,
  type DateRange,
  type RangePreset,
} from '../ranges'

const METHOD_LABEL: Record<string, string> = {
  mercado_pago: 'Mercado Pago',
  cash: 'Efectivo',
  transfer: 'Transferencia',
}
const TYPE_LABEL: Record<string, string> = { pickup: 'Retiro', delivery: 'Delivery', dine_in: 'Mesa' }

const compact = (n: number) =>
  n >= 1000
    ? `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(n / 1000)} mil`
    : String(n)

export function DashboardPage() {
  const tz = useStore().data?.timezone ?? 'America/Argentina/Buenos_Aires'
  const [preset, setPreset] = useState<RangePreset | 'custom'>('7d')
  const [custom, setCustom] = useState<DateRange>(() => presetRange('7d', new Date(), tz))
  const range = useMemo(
    () => (preset === 'custom' ? custom : presetRange(preset, new Date(), tz)),
    [preset, custom, tz],
  )
  const previous = useMemo(() => previousRange(range), [range])
  const invalid = range.to < range.from

  const current = useQuery({
    queryKey: ['admin', 'dashboard', range],
    queryFn: () => fetchDashboard(range.from, range.to),
    enabled: !invalid,
  })
  const before = useQuery({
    queryKey: ['admin', 'dashboard', previous],
    queryFn: () => fetchDashboard(previous.from, previous.to),
    enabled: !invalid,
  })

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Cómo viene el local. Los días van de 6 h a 6 h: lo que se vende de madrugada cuenta para la noche anterior."
      />

      <div className="mb-6 flex flex-wrap items-end gap-2" role="group" aria-label="Período">
        {PRESETS.map((p) => (
          <Chip
            key={p.id}
            selected={preset === p.id}
            onClick={() => {
              setPreset(p.id)
            }}
          >
            {p.label}
          </Chip>
        ))}
        <label className="ml-2 text-sm">
          <span className="block font-bold">Desde</span>
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => {
              setCustom({ from: e.target.value, to: range.to })
              setPreset('custom')
            }}
            className="min-h-11 rounded-md border-2 border-line bg-card px-2"
          />
        </label>
        <label className="text-sm">
          <span className="block font-bold">Hasta</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => {
              setCustom({ from: range.from, to: e.target.value })
              setPreset('custom')
            }}
            className="min-h-11 rounded-md border-2 border-line bg-card px-2"
          />
        </label>
      </div>

      {invalid && (
        <p role="alert" className="font-bold text-brand-text">
          La fecha "Hasta" no puede ser anterior a "Desde".
        </p>
      )}
      {current.isError && (
        <p role="alert" className="font-bold text-brand-text">
          No pudimos cargar el resumen. Probá de nuevo en un momento.
        </p>
      )}

      {current.isPending && !invalid ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : current.data ? (
        <div className="space-y-6">
          <Kpis now={current.data} before={before.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <SalesByDay data={current.data} />
            <OrdersByHour data={current.data} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <TopProducts data={current.data} />
            <Mix
              title="Medios de pago"
              rows={current.data.payment_mix.map((r) => ({
                label: METHOD_LABEL[r.method] ?? r.method,
                sales: r.sales,
                orders: r.orders,
              }))}
            />
            <Mix
              title="Tipo de pedido"
              rows={current.data.by_type.map((r) => ({
                label: TYPE_LABEL[r.type] ?? r.type,
                sales: r.sales,
                orders: r.orders,
              }))}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <Alerts />
      </div>
    </>
  )
}

function Kpis({ now, before }: { now: Dashboard; before: Dashboard | undefined }) {
  const items = [
    {
      label: 'Ventas',
      value: formatARS(now.totals.sales),
      delta: before ? change(now.totals.sales, before.totals.sales) : null,
    },
    {
      label: 'Pedidos',
      value: String(now.totals.orders),
      delta: before ? change(now.totals.orders, before.totals.orders) : null,
    },
    {
      label: 'Ticket promedio',
      value: formatARS(now.totals.avg_ticket),
      delta: before ? change(now.totals.avg_ticket, before.totals.avg_ticket) : null,
    },
    {
      label: 'Propinas',
      value: formatARS(now.totals.tips),
      delta: before ? change(now.totals.tips, before.totals.tips) : null,
    },
  ]
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((k) => (
        <li key={k.label} className="rounded-md border-2 border-line bg-card p-4">
          <p className="text-sm font-bold text-ink-soft">{k.label}</p>
          <p className="mt-1 font-display text-3xl tabular-nums">{k.value}</p>
          <Delta value={k.delta} />
        </li>
      ))}
    </ul>
  )
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <p className="mt-1 text-sm text-ink-soft">Sin período anterior para comparar</p>
  const up = value >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <p
      className={cn(
        'mt-1 inline-flex items-center gap-1 text-sm font-bold',
        up ? 'text-good' : 'text-brand-text',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {up ? '+' : ''}
      {value} % <span className="font-normal text-ink-soft">vs. período anterior</span>
    </p>
  )
}

const AXIS = { fontSize: 12, fill: 'var(--ink-soft)' }
const TOOLTIP_TEXT = { color: 'var(--ink)' }

function ChartData({
  caption,
  head,
  rows,
}: {
  caption: string
  head: [string, string]
  rows: [string, string][]
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-bold">Ver los datos en una tabla</summary>
      <table className="w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 pr-3">
              {head[0]}
            </th>
            <th scope="col" className="py-1 text-right">
              {head[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-t border-line">
              <th scope="row" className="py-1 pr-3 font-normal">
                {a}
              </th>
              <td className="py-1 text-right tabular-nums">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function SalesByDay({ data }: { data: Dashboard }) {
  const rows = data.by_day.map((d) => ({ day: shortDay(d.date), sales: d.sales, orders: d.orders }))
  return (
    <Panel title="Ventas por día">
      <div
        role="img"
        aria-label={`Ventas por día, de ${shortDay(data.from)} a ${shortDay(data.to)}. Total ${formatARS(data.totals.sales)}.`}
        className="h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="day" tick={AXIS} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
            <Tooltip
              formatter={(v) => formatARS(Number(v))}
              itemStyle={TOOLTIP_TEXT}
              labelStyle={TOOLTIP_TEXT}
              contentStyle={{
                background: 'var(--card)',
                border: '2px solid var(--line)',
                borderRadius: 8,
                color: 'var(--ink)',
              }}
              cursor={{ fill: 'var(--line)' }}
            />
            <Bar
              dataKey="sales"
              name="Ventas"
              fill="var(--brand)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartData
        caption="Ventas por día"
        head={['Día', 'Ventas']}
        rows={rows.map((r) => [r.day, `${formatARS(r.sales)} · ${r.orders} pedidos`])}
      />
    </Panel>
  )
}

function OrdersByHour({ data }: { data: Dashboard }) {
  // The shop works at night: show the evening shift in order (18 h → 05 h) instead of midnight → 23 h.
  const order = [...Array.from({ length: 6 }, (_, i) => i + 18), ...Array.from({ length: 6 }, (_, i) => i)]
  const byHour = new Map(data.by_hour.map((h) => [h.hour, h.orders]))
  const rows = order.map((h) => ({ hour: `${h} h`, orders: byHour.get(h) ?? 0 }))
  const outside = data.by_hour.filter((h) => !order.includes(h.hour) && h.orders > 0)
  return (
    <Panel title="Horas pico">
      <div role="img" aria-label="Pedidos por hora, de 18 h a 5 h" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="hour" tick={AXIS} tickLine={false} interval={1} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip
              itemStyle={TOOLTIP_TEXT}
              labelStyle={TOOLTIP_TEXT}
              contentStyle={{
                background: 'var(--card)',
                border: '2px solid var(--line)',
                borderRadius: 8,
                color: 'var(--ink)',
              }}
              cursor={{ fill: 'var(--line)' }}
            />
            <Bar
              dataKey="orders"
              name="Pedidos"
              fill="var(--color-maiz)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {outside.length > 0 && (
        <p className="mt-2 text-sm text-ink-soft">
          Además, {outside.reduce((n, h) => n + h.orders, 0)} pedidos fuera de ese horario.
        </p>
      )}
      <ChartData
        caption="Pedidos por hora"
        head={['Hora', 'Pedidos']}
        rows={rows.map((r) => [r.hour, String(r.orders)])}
      />
    </Panel>
  )
}

function TopProducts({ data }: { data: Dashboard }) {
  const max = Math.max(1, ...data.top_products.map((p) => p.quantity))
  return (
    <Panel title="Lo más pedido">
      {data.top_products.length === 0 ? (
        <p className="text-ink-soft">Todavía no hay ventas en este período.</p>
      ) : (
        <ol className="space-y-3">
          {data.top_products.map((p) => (
            <li key={p.name}>
              <div className="flex justify-between gap-2">
                <span className="font-bold">{p.name}</span>
                <span className="tabular-nums">{p.quantity} u.</span>
              </div>
              <div aria-hidden className="mt-1 h-2 rounded-full bg-ink/10">
                <div
                  className="h-2 rounded-full bg-brand"
                  style={{ width: `${(p.quantity / max) * 100}%` }}
                />
              </div>
              <p className="text-sm text-ink-soft">{formatARS(p.revenue)}</p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

function Mix({ title, rows }: { title: string; rows: { label: string; sales: number; orders: number }[] }) {
  const total = rows.reduce((n, r) => n + r.sales, 0)
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <p className="text-ink-soft">Sin datos todavía.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const pct = total === 0 ? 0 : Math.round((r.sales / total) * 100)
            return (
              <li key={r.label}>
                <div className="flex justify-between gap-2">
                  <span className="font-bold">{r.label}</span>
                  <span className="tabular-nums">{pct} %</span>
                </div>
                <div aria-hidden className="mt-1 h-2 rounded-full bg-ink/10">
                  <div className="h-2 rounded-full bg-nopal" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-sm text-ink-soft">
                  {formatARS(r.sales)} · {r.orders} {r.orders === 1 ? 'pedido' : 'pedidos'}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

const ALERT_LABEL: Record<string, string> = {
  late_payment: 'Pago tardío',
  refund: 'Reembolso',
  amount_mismatch: 'Monto distinto',
  unknown_order: 'Pago sin pedido',
}

function Alerts() {
  const queryClient = useQueryClient()
  const alerts = useQuery({ queryKey: alertsKey, queryFn: fetchAlerts })
  const resolve = useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alertsKey }),
    onError: () => toast.error('No se pudo marcar como resuelto.'),
  })
  const list = alerts.data ?? []
  return (
    <Panel title="Avisos">
      {list.length === 0 ? (
        <p className="text-ink-soft">
          No hay avisos pendientes. Acá aparecen los pagos que requieren que los mires.
        </p>
      ) : (
        <ul className="divide-y-2 divide-line">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-bold">{ALERT_LABEL[a.kind] ?? a.kind}</p>
                <p className="text-ink-soft">{a.message}</p>
              </div>
              <div className="flex gap-2">
                {a.orderId && (
                  <Link
                    to={`/admin/pedidos/${a.orderId}`}
                    className="inline-flex min-h-11 items-center rounded-md border-2 border-ink px-4 font-bold hover:bg-ink/10"
                  >
                    Ver pedido
                  </Link>
                )}
                <Button
                  variant="outline"
                  leadingIcon={<Check aria-hidden className="size-4" />}
                  onClick={() => {
                    resolve.mutate(a.id)
                  }}
                >
                  Resuelto
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
