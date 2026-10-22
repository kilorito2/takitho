import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, PauseCircle, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toastStore'
import { cn } from '@/lib/cn'
import { menuKeys, useMenu, useStore } from '@/features/catalog/hooks'
import { setProductAvailable, setStorePaused } from '../api'

/** "Agotar producto" and "Pausar pedidos": the two things the kitchen needs to say mid-service (RPCs, any staff role). */
export function StockPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const menu = useMenu()
  const store = useStore()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')

  const toggleProduct = useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) => setProductAvailable(id, available),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: menuKeys.menu }),
    onError: () => toast.error('No se pudo cambiar. Probá de nuevo.'),
  })
  const togglePause = useMutation({
    mutationFn: (paused: boolean) => setStorePaused(paused),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: menuKeys.store }),
    onError: () => toast.error('No se pudo cambiar la pausa. Probá de nuevo.'),
  })

  const groups = useMemo(() => {
    const data = menu.data
    if (!data) return []
    const needle = filter.trim().toLowerCase()
    return data.categories
      .map((c) => ({
        category: c,
        products: data.products.filter(
          (p) => p.categoryId === c.id && (needle === '' || p.name.toLowerCase().includes(needle)),
        ),
      }))
      .filter((g) => g.products.length > 0)
  }, [menu.data, filter])

  const paused = store.data?.isPaused ?? false

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agotar y pausar"
      description="Los cambios se ven al instante en el menú de los clientes."
      className="max-w-2xl"
    >
      <div className="space-y-5">
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-md border-2 p-3',
            paused ? 'border-maiz bg-maiz/15' : 'border-line',
          )}
        >
          <div>
            <p className="text-lg font-bold">
              {paused ? 'Los pedidos están pausados' : 'Recibiendo pedidos'}
            </p>
            <p className="text-ink-soft">
              {paused
                ? 'Los clientes solo pueden programar para más tarde.'
                : 'Pausalo si se juntó mucho trabajo.'}
            </p>
          </div>
          <Button
            size="lg"
            variant={paused ? 'primary' : 'secondary'}
            loading={togglePause.isPending}
            leadingIcon={
              paused ? (
                <PlayCircle aria-hidden className="size-5" />
              ) : (
                <PauseCircle aria-hidden className="size-5" />
              )
            }
            onClick={() => {
              togglePause.mutate(!paused)
            }}
          >
            {paused ? 'Reanudar pedidos' : 'Pausar pedidos'}
          </Button>
        </div>

        <TextField
          label="Buscar producto"
          type="search"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
          }}
        />

        <div className="max-h-[50dvh] space-y-5 overflow-y-auto pr-1">
          {menu.isPending && <p className="text-ink-soft">Cargando el menú…</p>}
          {menu.isError && (
            <p role="alert" className="font-bold">
              No pudimos cargar el menú.
            </p>
          )}
          {groups.map(({ category, products }) => (
            <section key={category.id} aria-labelledby={`stock-${category.id}`}>
              <h3 id={`stock-${category.id}`} className="mb-2 font-display text-xl">
                {category.name}
              </h3>
              <ul className="space-y-2">
                {products.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-md border-2 border-line p-2 pl-3"
                  >
                    <span className={cn('text-lg', !p.isAvailable && 'text-ink-soft line-through')}>
                      {p.name}
                    </span>
                    <Button
                      variant={p.isAvailable ? 'outline' : 'secondary'}
                      aria-pressed={!p.isAvailable}
                      aria-label={p.isAvailable ? `Agotar ${p.name}` : `Volver a habilitar ${p.name}`}
                      leadingIcon={
                        p.isAvailable ? (
                          <Ban aria-hidden className="size-4" />
                        ) : (
                          <Check aria-hidden className="size-4" />
                        )
                      }
                      onClick={() => {
                        toggleProduct.mutate({ id: p.id, available: !p.isAvailable })
                      }}
                    >
                      {p.isAvailable ? 'Agotar' : 'Agotado · habilitar'}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {menu.data && groups.length === 0 && (
            <p className="text-ink-soft">No hay productos que coincidan.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
