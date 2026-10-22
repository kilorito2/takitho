import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChalkHeading } from '@/components/illustrations/Decor'
import { Button } from '@/components/ui/Button'
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { useCart } from '@/features/cart/store'
import { flyToCart } from '@/features/cart/fly'
import { CartBar } from '@/features/cart/components/CartBar'
import { useUi } from '@/features/cart/ui'
import { parseTable, useTable } from '@/features/cart/table'
import { filterProducts, groupByCategory, type DietFilter } from '@/features/catalog/catalog'
import { CategoryTabs } from './components/CategoryTabs'
import { useScrollSpy } from './useScrollSpy'
import { MenuToolbar } from './components/MenuToolbar'
import { ProductCard } from '@/features/catalog/components/ProductCard'
import { StoreBanner } from '@/features/catalog/components/StoreBanner'
import { useMenu } from '@/features/catalog/hooks'
import type { MenuProduct } from '@/features/catalog/types'
import { usePageMeta } from '@/lib/seo'

const sectionId = (id: string) => `cat-${id}`

export function MenuPage() {
  usePageMeta({
    title: 'Menú',
    description:
      'Mirá el menú de Takitho: tacos, quesabirria, quesadillas, bebidas y postres. Pedí online para retirar, delivery o en tu mesa.',
  })
  const menu = useMenu()
  const [params] = useSearchParams()
  const setTable = useTable((s) => s.setTable)
  const tableNumber = useTable((s) => s.tableNumber)
  const add = useCart((s) => s.add)
  const openProduct = useUi((s) => s.openProduct)
  const [query, setQuery] = useState('')
  const [diets, setDiets] = useState<DietFilter[]>([])

  // The table QR opens /menu?mesa=N: remember it for the session so checkout can offer "comer acá".
  const mesaParam = params.get('mesa')
  useMemo(() => {
    const n = parseTable(mesaParam)
    if (n !== null) setTable(n)
  }, [mesaParam, setTable])

  const data = menu.data
  const filtering = query.trim() !== '' || diets.length > 0
  const filtered = useMemo(
    () => (data ? filterProducts(data.products, { query, diets }) : []),
    [data, query, diets],
  )
  const sections = useMemo(() => (data ? groupByCategory(data, filtered) : []), [data, filtered])
  const ids = useMemo(() => sections.map((s) => sectionId(s.id)), [sections])
  const active = useScrollSpy(ids)

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  const quickAdd = useCallback(
    (p: MenuProduct, source: Element | null) => {
      add({
        productId: p.id,
        quantity: 1,
        modifierIds: [],
        note: '',
        snapshot: { name: p.name, unitPrice: p.price, imagePublicId: p.imagePublicId, modifierNames: [] },
      })
      toast.success('Sumado a la comanda', { description: p.name })
      void flyToCart(source)
    },
    [add],
  )

  if (menu.isPending) {
    return (
      <SkeletonGroup label="Cargando el menú…" className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </SkeletonGroup>
    )
  }
  if (menu.isError || !data) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
        <h1 className="text-3xl">No pudimos traer el menú</h1>
        <p className="mt-2 text-ink-soft">
          Se cortó la señal o estamos con un problema. Probá de nuevo en un toque.
        </p>
        <Button className="mt-6" size="lg" onClick={() => void menu.refetch()}>
          Reintentar
        </Button>
      </section>
    )
  }

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <h1 className="sr-only">Menú de Takitho</h1>
        <StoreBanner className="mb-2" />
        {tableNumber !== null && (
          <p
            className="rounded-md bg-nopal px-3 py-2 text-sm font-bold text-tortilla"
            data-testid="table-banner"
          >
            Estás en la mesa {tableNumber}: tu pedido te lo llevamos ahí.
          </p>
        )}
      </div>
      <MenuToolbar
        query={query}
        onQuery={setQuery}
        diets={diets}
        onToggleDiet={(d) => {
          setDiets((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
        }}
        resultCount={filtered.length}
        filtering={filtering}
      />
      {sections.length > 0 && (
        <CategoryTabs
          tabs={sections.map((s) => ({ id: sectionId(s.id), name: s.name }))}
          activeId={active}
          onSelect={goTo}
        />
      )}

      <div className="pb-28">
        {sections.length === 0 ? (
          <section className="mx-auto max-w-md px-4 py-16 text-center">
            <p className="font-chalk text-4xl text-ink">Nada por acá…</p>
            <p className="mt-2 text-ink-soft">Probá con otra palabra o sacá algún filtro.</p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => {
                setQuery('')
                setDiets([])
              }}
            >
              Ver todo el menú
            </Button>
          </section>
        ) : (
          sections.map((s, si) => (
            <section
              key={s.id}
              id={sectionId(s.id)}
              aria-labelledby={`${sectionId(s.id)}-title`}
              className="scroll-mt-32"
            >
              <div className="texture-chalk shadow-[inset_0_10px_18px_-10px_rgb(0_0_0/0.55)]">
                <div className="mx-auto max-w-5xl px-4 pt-6 pb-8">
                  <div id={`${sectionId(s.id)}-title`}>
                    <ChalkHeading>{s.name}</ChalkHeading>
                  </div>
                  {s.description && (
                    <p className="-mt-1 mb-4 font-chalk text-2xl text-tiza/85">{s.description}</p>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    {s.products.map((p, pi) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        priority={si === 0 && pi < 2}
                        onOpen={(prod) => {
                          openProduct(prod.id)
                        }}
                        onQuickAdd={quickAdd}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {/* the wooden counter the cards rest on */}
              <div
                aria-hidden
                className="h-4 border-y-2 border-(--shadow-ink) texture-wood shadow-[0_6px_10px_-4px_rgb(0_0_0/0.4)]"
              />
            </section>
          ))
        )}
      </div>
      <CartBar />
    </>
  )
}
