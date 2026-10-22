import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

interface Tab {
  id: string
  name: string
}

interface Props {
  tabs: readonly Tab[]
  activeId: string | null
  onSelect: (id: string) => void
}

/** Sticky category strip. It is navigation (all sections stay on the page), so it exposes aria-current, not tab roles. */
export function CategoryTabs({ tabs, activeId, onSelect }: Props) {
  const strip = useRef<HTMLDivElement>(null)

  // Keep the active chip visible inside the horizontal strip.
  useEffect(() => {
    const chip = strip.current?.querySelector<HTMLElement>('[aria-current="true"]')
    chip?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [activeId])

  return (
    <nav
      aria-label="Categorías del menú"
      className="sticky top-(--header-h) z-20 border-b-2 border-line bg-paper-bg/95 backdrop-blur-[2px]"
    >
      <div
        ref={strip}
        className="mx-auto flex max-w-5xl [scrollbar-width:none] gap-2 overflow-x-auto px-4 py-2"
      >
        {tabs.map((t) => {
          const active = t.id === activeId
          return (
            <button
              key={t.id}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                onSelect(t.id)
              }}
              className={cn(
                'min-h-11 shrink-0 rounded-full border-2 px-4 font-chalk text-2xl leading-none transition-colors duration-150',
                active ? 'border-ink bg-ink text-paper-bg' : 'border-line bg-card text-ink hover:border-ink',
              )}
            >
              {t.name}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
