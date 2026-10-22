import { Flame, Leaf, Search, WheatOff, X } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import type { DietFilter } from '@/features/catalog/catalog'

interface Props {
  query: string
  onQuery: (value: string) => void
  diets: readonly DietFilter[]
  onToggleDiet: (diet: DietFilter) => void
  resultCount: number
  filtering: boolean
}

const DIETS: { id: DietFilter; label: string; icon: typeof Leaf }[] = [
  { id: 'veggie', label: 'Veggie', icon: Leaf },
  { id: 'sin_tacc', label: 'Sin TACC', icon: WheatOff },
  { id: 'picante', label: 'Picante', icon: Flame },
]

export function MenuToolbar({ query, onQuery, diets, onToggleDiet, resultCount, filtering }: Props) {
  return (
    <div className="mx-auto max-w-5xl space-y-3 px-4 py-4">
      <div role="search">
        <label htmlFor="menu-search" className="sr-only">
          Buscar en el menú
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-soft"
          />
          <input
            id="menu-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="¿Qué se te antoja?"
            value={query}
            onChange={(e) => {
              onQuery(e.target.value)
            }}
            className="min-h-12 w-full rounded-md border-2 border-line bg-card pr-11 pl-10 text-base text-ink placeholder:text-ink-soft/80"
          />
          {query && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => {
                onQuery('')
              }}
              className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-md text-ink-soft hover:bg-ink/10"
            >
              <X aria-hidden className="size-5" />
            </button>
          )}
        </div>
      </div>
      <div role="group" aria-label="Filtros del menú" className="flex flex-wrap gap-2">
        {DIETS.map(({ id, label, icon: Icon }) => (
          <Chip
            key={id}
            selected={diets.includes(id)}
            onClick={() => {
              onToggleDiet(id)
            }}
            icon={<Icon aria-hidden className="size-4" />}
          >
            {label}
          </Chip>
        ))}
      </div>
      <p aria-live="polite" className="text-sm text-ink-soft empty:hidden">
        {filtering
          ? resultCount === 0
            ? 'No encontramos nada con eso.'
            : `${resultCount} ${resultCount === 1 ? 'opción' : 'opciones'}`
          : ''}
      </p>
    </div>
  )
}
