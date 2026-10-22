import { useRef } from 'react'
import { Flame, Leaf, Plus, Star, WheatOff } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { SpiceLevel } from '@/components/ui/SpiceLevel'
import { cn } from '@/lib/cn'
import { formatARS } from '@/lib/money'
import type { MenuProduct } from '../types'
import { ProductImage } from './ProductImage'

interface Props {
  product: MenuProduct
  onOpen: (product: MenuProduct) => void
  /** Products without options can be added straight from the card. */
  onQuickAdd?: ((product: MenuProduct, source: Element | null) => void) | undefined
  priority?: boolean
}

/** A menu card: paper on the wooden counter. Sold-out items stay visible but cannot be ordered. */
export function ProductCard({ product, onOpen, onQuickAdd, priority = false }: Props) {
  const imageBox = useRef<HTMLDivElement>(null)
  const soldOut = !product.isAvailable
  const canQuickAdd = !soldOut && product.groupIds.length === 0 && onQuickAdd !== undefined

  return (
    <article
      data-testid="product-card"
      data-product={product.name}
      className={cn(
        'relative flex gap-3 rounded-lg border-2 border-(--shadow-ink) bg-card p-3 text-ink shadow-chunk-sm transition-transform duration-150 ease-out',
        soldOut ? 'opacity-70' : 'active:translate-x-px active:translate-y-px',
      )}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-xl leading-tight">{product.name}</h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{product.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {product.tags.includes('destacado') && !soldOut && (
            <Badge tone="promo" icon={<Star aria-hidden className="size-3" />}>
              De la casa
            </Badge>
          )}
          {product.tags.includes('veggie') && (
            <Badge tone="veggie" icon={<Leaf aria-hidden className="size-3" />}>
              Veggie
            </Badge>
          )}
          {product.tags.includes('sin_tacc') && (
            <Badge tone="gluten" icon={<WheatOff aria-hidden className="size-3" />}>
              Sin TACC
            </Badge>
          )}
          {product.spicyLevel > 0 && <SpiceLevel level={product.spicyLevel} />}
          {soldOut && (
            <Badge tone="muted" icon={<Flame aria-hidden className="size-3" />}>
              Se nos terminó por hoy
            </Badge>
          )}
        </div>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-xl text-brand-text">{formatARS(product.price)}</span>
          {product.unitLabel && <span className="text-xs text-ink-soft">{product.unitLabel}</span>}
        </p>
      </div>

      <div ref={imageBox} className="relative size-28 shrink-0 self-start sm:size-32">
        <ProductImage
          publicId={product.imagePublicId}
          alt=""
          sizes="(min-width: 640px) 128px, 112px"
          priority={priority}
          soldOut={soldOut}
          className="size-full rounded-md border-2 border-(--shadow-ink)"
        />
        {canQuickAdd && (
          <button
            type="button"
            aria-label={`Sumar ${product.name} a la comanda`}
            onClick={() => {
              onQuickAdd(product, imageBox.current)
            }}
            className="absolute -right-2 -bottom-2 z-10 grid size-11 place-items-center rounded-full border-2 border-(--shadow-ink) bg-brand text-on-brand shadow-chunk-sm transition-transform duration-150 ease-out active:scale-95"
          >
            <Plus aria-hidden className="size-6" />
          </button>
        )}
      </div>

      {/* Whole-card hit area. Sits under the quick-add button (z-10) so both stay separately focusable. */}
      <button
        type="button"
        disabled={soldOut}
        aria-label={soldOut ? `${product.name}, agotado` : `Elegir ${product.name}`}
        onClick={() => {
          onOpen(product)
        }}
        className="absolute inset-0 rounded-lg disabled:cursor-not-allowed"
      />
    </article>
  )
}
