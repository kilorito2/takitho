import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageHeader } from '../components/PageHeader'
import { adminMenuKey, fetchAdminMenu } from '../menuApi'
import { CategoriesTab } from './menu/CategoriesTab'
import { GroupsTab } from './menu/GroupsTab'
import { ProductsTab } from './menu/ProductsTab'

const TABS = [
  { id: 'productos', label: 'Productos' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'opciones', label: 'Opciones' },
] as const

type TabId = (typeof TABS)[number]['id']

export function MenuAdminPage() {
  const [tab, setTab] = useState<TabId>('productos')
  const menu = useQuery({ queryKey: adminMenuKey, queryFn: fetchAdminMenu })

  return (
    <>
      <PageHeader
        title="Menú"
        description="Productos, categorías y opciones (tortilla, salsas, extras). Los cambios se ven al instante en el menú de los clientes."
      />
      <div role="tablist" aria-label="Secciones del menú" className="mb-6 flex gap-2 border-b-2 border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => {
              setTab(t.id)
            }}
            onKeyDown={(e) => {
              const i = TABS.findIndex((x) => x.id === tab)
              const next =
                e.key === 'ArrowRight'
                  ? TABS[(i + 1) % TABS.length]
                  : e.key === 'ArrowLeft'
                    ? TABS[(i + TABS.length - 1) % TABS.length]
                    : undefined
              if (next) {
                setTab(next.id)
                document.getElementById(`tab-${next.id}`)?.focus()
              }
            }}
            className={`-mb-0.5 min-h-11 border-b-4 px-4 font-display text-lg ${tab === t.id ? 'border-brand' : 'border-transparent text-ink-soft hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {menu.isPending && <Skeleton className="h-64" />}
      {menu.isError && (
        <p role="alert" className="font-bold text-brand-text">
          No pudimos cargar el menú.
        </p>
      )}
      {menu.data && (
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'productos' && <ProductsTab menu={menu.data} />}
          {tab === 'categorias' && <CategoriesTab menu={menu.data} />}
          {tab === 'opciones' && <GroupsTab menu={menu.data} />}
        </div>
      )}
    </>
  )
}
