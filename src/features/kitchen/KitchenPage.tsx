import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Ban, BellRing, ChevronDown, LogOut, RefreshCw, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useNow, useStore } from '@/features/catalog/hooks'
import { RequireRole } from '@/features/staff/RequireRole'
import { useStaffStore } from '@/features/staff/store'
import { OrderCard } from './components/OrderCard'
import { PrintTicket, type PaperWidth } from './components/PrintTicket'
import { StockPanel } from './components/StockPanel'
import {
  useAdvanceOrder,
  useFreshOrders,
  useKitchenOrders,
  useKitchenSettings,
  useTitleAlert,
  useWakeLock,
} from './hooks'
import { advanceAction, boardOrders, dragTarget, type Column, type KitchenOrder } from './model'
import { useSound } from './sound'

const COLUMN_TITLES: Record<Exclude<Column, 'done'>, { title: string; empty: string }> = {
  new: { title: 'Nuevos', empty: 'Sin pedidos nuevos.' },
  preparing: { title: 'En preparación', empty: 'Nada en el comal.' },
  ready: { title: 'Listos', empty: 'Nada esperando entrega.' },
}
const ACTIVE_COLUMNS = ['new', 'preparing', 'ready'] as const

const PAPER_KEY = 'takitho-kitchen-paper'
const DEFAULTS = { prepMinutes: 25, warnMinutes: 10, lateMinutes: 20 }

function readPaper(): PaperWidth {
  try {
    return localStorage.getItem(PAPER_KEY) === '58' ? '58' : '80'
  } catch {
    return '80'
  }
}

export function KitchenPage() {
  return (
    <RequireRole roles={['kitchen', 'admin']}>
      <KitchenBoard />
    </RequireRole>
  )
}

/** The kitchen runs on a dark, high-contrast theme whatever the customer picked, and installs as its own app (ADR-0011). */
function useKitchenChrome(): void {
  useEffect(() => {
    const root = document.documentElement
    const previousTheme = root.dataset.theme
    root.dataset.theme = 'dark'
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const previousManifest = link?.getAttribute('href')
    link?.setAttribute('href', '/cocina.webmanifest')
    const previousTitle = document.title
    document.title = 'Cocina · Takitho'
    return () => {
      if (previousTheme === undefined) delete root.dataset.theme
      else root.dataset.theme = previousTheme
      if (previousManifest) link?.setAttribute('href', previousManifest)
      document.title = previousTitle
    }
  }, [])
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(document.hidden)
  useEffect(() => {
    const onChange = () => {
      setHidden(document.hidden)
    }
    document.addEventListener('visibilitychange', onChange)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
    }
  }, [])
  return hidden
}

function KitchenBoard() {
  useKitchenChrome()
  useWakeLock(true)

  const staff = useStaffStore((s) => s.staff)
  const signOut = useStaffStore((s) => s.signOut)
  const orders = useKitchenOrders()
  const settings = useKitchenSettings().data ?? DEFAULTS
  const store = useStore()
  const tz = store.data?.timezone ?? 'America/Argentina/Buenos_Aires'
  const now = useNow(15_000)
  const advance = useAdvanceOrder()

  const sound = useSound()
  const hidden = useDocumentHidden()
  const [announcement, setAnnouncement] = useState('')
  const { fresh, dismiss } = useFreshOrders(orders.data, (arrived) => {
    sound.ring()
    setAnnouncement(`Pedido nuevo: ${arrived.map((o) => o.code).join(', ')}`)
  })
  useTitleAlert(hidden ? fresh.size : 0)

  // Browsers only allow sound after a gesture: try on the first tap anywhere; the button covers the rest.
  // On `click`, not `pointerdown`: unlocking removes the "Activar sonido" button, and a layout shift between
  // press and release would swallow the very tap that triggered it.
  useEffect(() => {
    const unlockOnce = () => void useSound.getState().unlock()
    window.addEventListener('click', unlockOnce, { once: true })
    return () => {
      window.removeEventListener('click', unlockOnce)
    }
  }, [])

  const [paper, setPaper] = useState<PaperWidth>(readPaper)
  const [printing, setPrinting] = useState<KitchenOrder | null>(null)
  const [stockOpen, setStockOpen] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [tab, setTab] = useState<Exclude<Column, 'done'>>('new')

  useEffect(() => {
    if (!printing) return
    const clear = () => {
      setPrinting(null)
    }
    window.addEventListener('afterprint', clear, { once: true })
    // Wait for the ticket to be in the DOM before opening the print dialog.
    const id = window.requestAnimationFrame(() => {
      window.print()
    })
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('afterprint', clear)
    }
  }, [printing])

  const board = useMemo(
    () => boardOrders(orders.data ?? [], settings.prepMinutes),
    [orders.data, settings.prepMinutes],
  )

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const move = (order: KitchenOrder) => {
    const action = advanceAction(order)
    if (!action) return
    dismiss(order.id)
    advance.mutate({ order, to: action.to })
  }

  const onDragEnd = (event: DragEndEvent) => {
    const order = orders.data?.find((o) => o.id === event.active.id)
    if (order && event.over?.id === dragTarget(order)) move(order)
  }

  const changePaper = (value: PaperWidth) => {
    setPaper(value)
    try {
      localStorage.setItem(PAPER_KEY, value)
    } catch {
      // Not persisted in private mode; it still applies for this session.
    }
  }

  const offline = orders.connection === 'offline'
  const total = board.new.length + board.preparing.length + board.ready.length

  return (
    <div className="flex h-dvh flex-col bg-paper-bg text-ink">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-line px-4 py-2">
        <Logo variant="isotipo" className="size-10" />
        <h1 className="font-display text-2xl">Cocina</h1>
        <span
          role="status"
          data-testid="connection"
          data-state={orders.connection}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-bold',
            offline ? 'border-chile-claro text-chile-claro' : 'border-line text-ink-soft',
          )}
        >
          {offline ? <WifiOff aria-hidden className="size-4" /> : <Wifi aria-hidden className="size-4" />}
          {orders.connection === 'online' ? 'En vivo' : offline ? 'Sin conexión' : 'Conectando…'}
        </span>
        <p className="text-ink-soft">
          {total === 0
            ? 'Sin pedidos en curso'
            : `${total} ${total === 1 ? 'pedido en curso' : 'pedidos en curso'}`}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!sound.unlocked && !sound.muted && (
            <Button
              variant="secondary"
              leadingIcon={<BellRing aria-hidden className="size-5" />}
              onClick={() => void sound.unlock()}
            >
              Activar sonido
            </Button>
          )}
          <IconButton
            aria-label="Aviso sonoro"
            aria-pressed={!sound.muted}
            variant="outline"
            onClick={sound.toggleMute}
          >
            {sound.muted ? (
              <VolumeX aria-hidden className="size-6" />
            ) : (
              <Volume2 aria-hidden className="size-6" />
            )}
          </IconButton>
          <Button
            variant="outline"
            leadingIcon={<Ban aria-hidden className="size-5" />}
            onClick={() => {
              setStockOpen(true)
            }}
          >
            Agotar / Pausar
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">Papel</span>
            <select
              value={paper}
              onChange={(e) => {
                changePaper(e.target.value === '58' ? '58' : '80')
              }}
              className="min-h-11 rounded-md border-2 border-line bg-card px-2 text-base"
            >
              <option value="58">58 mm</option>
              <option value="80">80 mm</option>
            </select>
          </label>
          <Button
            variant="ghost"
            leadingIcon={<LogOut aria-hidden className="size-5" />}
            onClick={() => void signOut()}
          >
            Salir{staff ? ` (${staff.name || staff.email})` : ''}
          </Button>
        </div>
      </header>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {offline && (
        <p
          role="alert"
          className="flex items-center gap-2 border-b-2 border-chile-claro bg-chile/20 px-4 py-2 font-bold"
        >
          <WifiOff aria-hidden className="size-5" />
          Sin conexión. Seguimos intentando; lo que ves puede estar desactualizado.
        </p>
      )}

      <nav aria-label="Columnas" className="grid grid-cols-3 gap-2 border-b-2 border-line p-2 md:hidden">
        {ACTIVE_COLUMNS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={tab === c}
            onClick={() => {
              setTab(c)
            }}
            className={cn(
              'min-h-12 rounded-md border-2 px-2 font-display text-base',
              tab === c ? 'border-ink bg-ink text-paper-bg' : 'border-line',
            )}
          >
            {COLUMN_TITLES[c].title} ({board[c].length})
          </button>
        ))}
      </nav>

      {orders.isError && !orders.data ? (
        <div className="grid flex-1 place-content-center gap-3 p-6 text-center">
          <p className="font-display text-3xl">No pudimos cargar los pedidos</p>
          <Button
            size="lg"
            leadingIcon={<RefreshCw aria-hidden className="size-5" />}
            onClick={() => void orders.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <main className="grid min-h-0 flex-1 gap-3 p-3 md:grid-cols-3">
            {ACTIVE_COLUMNS.map((c) => (
              <BoardColumn
                key={c}
                column={c}
                title={COLUMN_TITLES[c].title}
                count={board[c].length}
                className={cn(tab === c ? 'flex' : 'hidden', 'md:flex')}
              >
                {orders.isPending ? (
                  <Skeleton className="h-48 w-full" />
                ) : board[c].length === 0 ? (
                  <p className="py-8 text-center font-chalk text-3xl text-ink-soft">
                    {COLUMN_TITLES[c].empty}
                  </p>
                ) : (
                  board[c].map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      now={now}
                      tz={tz}
                      {...settings}
                      isNew={c === 'new' && fresh.has(o.id)}
                      busy={advance.isPending && advance.variables.order.id === o.id}
                      onAdvance={move}
                      onPrint={setPrinting}
                      onSeen={dismiss}
                    />
                  ))
                )}
              </BoardColumn>
            ))}
          </main>
        </DndContext>
      )}

      <section aria-label="Entregados" className="border-t-2 border-line">
        <button
          type="button"
          aria-expanded={doneOpen}
          aria-controls="done-list"
          onClick={() => {
            setDoneOpen((v) => !v)
          }}
          className="flex min-h-12 w-full items-center justify-between px-4 font-display text-lg"
        >
          Entregados ({board.done.length})
          <ChevronDown
            aria-hidden
            className={cn('size-5 transition-transform duration-200 ease-out', doneOpen && 'rotate-180')}
          />
        </button>
        {doneOpen && (
          <div id="done-list" className="grid max-h-[40dvh] gap-3 overflow-y-auto p-3 md:grid-cols-3">
            {board.done.length === 0 && (
              <p className="text-ink-soft">Todavía no entregaste ninguno en este turno.</p>
            )}
            {board.done.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                now={now}
                tz={tz}
                {...settings}
                compact
                isNew={false}
                busy={false}
                onAdvance={move}
                onPrint={setPrinting}
                onSeen={dismiss}
              />
            ))}
          </div>
        )}
      </section>

      <StockPanel
        open={stockOpen}
        onClose={() => {
          setStockOpen(false)
        }}
      />
      {printing && <PrintTicket order={printing} paper={paper} tz={tz} />}
    </div>
  )
}

function BoardColumn({
  column,
  title,
  count,
  className,
  children,
}: {
  column: Column
  title: string
  count: number
  className?: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column })
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`col-${column}`}
      data-testid={`column-${column}`}
      className={cn(
        'min-h-0 flex-col rounded-lg border-2 border-dashed bg-ink/5',
        isOver ? 'border-maiz bg-maiz/10' : 'border-line',
        className,
      )}
    >
      <h2
        id={`col-${column}`}
        className="flex items-center justify-between px-4 pt-3 pb-2 font-display text-2xl"
      >
        {title}
        <span className="rounded-full bg-ink px-3 py-0.5 font-mono text-lg text-paper-bg">{count}</span>
      </h2>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pt-2 pb-4">{children}</div>
    </section>
  )
}
