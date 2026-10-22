import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toastStore'
import { ProductImage } from '@/features/catalog/components/ProductImage'
import { formatARS } from '@/lib/money'
import { cn } from '@/lib/cn'
import { ProductForm } from '../../components/ProductForm'
import { SortableList } from '../../components/SortableList'
import {
  saveOrder,
  setProductActive,
  setProductAvailable,
  type AdminMenu,
  type AdminProduct,
} from '../../menuApi'

export function ProductsTab({ menu }: { menu: AdminMenu }) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [editing, setEditing] = useState<{ product: AdminProduct | null; categoryId?: string } | null>(null)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] })
    await queryClient.invalidateQueries({ queryKey: ['menu'] })
  }
  const fail = () => toast.error('No se pudo guardar el cambio.')
  const reorder = useMutation({
    mutationFn: (ids: string[]) => saveOrder('products', ids),
    onSuccess: refresh,
    onError: fail,
  })
  const available = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setProductAvailable(id, on),
    onSuccess: refresh,
    onError: fail,
  })
  const active = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setProductActive(id, on),
    onSuccess: refresh,
    onError: fail,
  })

  const needle = filter.trim().toLowerCase()
  const filtering = needle !== ''

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <label>
            <span className="block font-bold">Buscar producto</span>
            <input
              type="search"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
              }}
              className="min-h-11 rounded-md border-2 border-line bg-card px-2"
            />
          </label>
          <label className="inline-flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => {
                setShowHidden(e.target.checked)
              }}
              className="size-5"
            />
            Mostrar ocultos
          </label>
        </div>
        <Button
          leadingIcon={<Plus aria-hidden className="size-5" />}
          onClick={() => {
            setEditing({ product: null })
          }}
        >
          Nuevo producto
        </Button>
      </div>

      <div className="space-y-8">
        {menu.categories
          .filter((c) => c.isActive || showHidden)
          .map((c) => {
            const products = menu.products.filter(
              (p) =>
                p.categoryId === c.id &&
                (p.isActive || showHidden) &&
                (!filtering || p.name.toLowerCase().includes(needle)),
            )
            if (filtering && products.length === 0) return null
            return (
              <section key={c.id} aria-labelledby={`cat-${c.id}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 id={`cat-${c.id}`} className="font-display text-2xl">
                    {c.name} {!c.isActive && <Badge tone="muted">Oculta</Badge>}
                  </h2>
                  <Button
                    variant="ghost"
                    leadingIcon={<Plus aria-hidden className="size-4" />}
                    onClick={() => {
                      setEditing({ product: null, categoryId: c.id })
                    }}
                  >
                    Agregar
                  </Button>
                </div>
                {products.length === 0 ? (
                  <p className="text-ink-soft">Sin productos.</p>
                ) : (
                  <SortableList
                    items={products}
                    label={`Productos de ${c.name}`}
                    nameOf={(p) => p.name}
                    disabled={filtering || reorder.isPending}
                    onReorder={(ids) => {
                      reorder.mutate(ids)
                    }}
                  >
                    {(p) => (
                      <div className={cn('flex items-center gap-3', !p.isActive && 'opacity-60')}>
                        <ProductImage
                          publicId={p.imagePublicId}
                          alt=""
                          sizes="56px"
                          className="size-14 shrink-0 rounded-md object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">
                            {p.name} {p.type === 'combo' && <Badge tone="promo">Combo</Badge>}{' '}
                            {!p.isActive && <Badge tone="muted">Oculto</Badge>}
                          </p>
                          <p className="text-sm text-ink-soft">{formatARS(p.price)}</p>
                        </div>
                        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-5"
                            checked={p.isAvailable}
                            onChange={(e) => {
                              available.mutate({ id: p.id, on: e.target.checked })
                            }}
                            aria-label={`${p.name}: disponible`}
                          />
                          <span className="hidden sm:inline">{p.isAvailable ? 'Disponible' : 'Agotado'}</span>
                        </label>
                        <button
                          type="button"
                          aria-label={`Editar ${p.name}`}
                          onClick={() => {
                            setEditing({ product: p })
                          }}
                          className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
                        >
                          <Pencil aria-hidden className="size-5" />
                        </button>
                        <button
                          type="button"
                          aria-label={
                            p.isActive ? `Ocultar ${p.name} del menú` : `Mostrar ${p.name} en el menú`
                          }
                          onClick={() => {
                            active.mutate({ id: p.id, on: !p.isActive })
                          }}
                          className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
                        >
                          {p.isActive ? (
                            <EyeOff aria-hidden className="size-5" />
                          ) : (
                            <Eye aria-hidden className="size-5" />
                          )}
                        </button>
                      </div>
                    )}
                  </SortableList>
                )}
              </section>
            )
          })}
      </div>

      {editing && (
        <ProductForm
          key={editing.product?.id ?? `new-${editing.categoryId ?? ''}`}
          open
          product={editing.product}
          menu={menu}
          {...(editing.categoryId ? { defaultCategoryId: editing.categoryId } : {})}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
    </>
  )
}
