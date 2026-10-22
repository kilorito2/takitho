import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Dialog'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { SpiceLevel } from '@/components/ui/SpiceLevel'
import { toast } from '@/components/ui/toastStore'
import { cn } from '@/lib/cn'
import { formatARS } from '@/lib/money'
import { flyToCart } from '../fly'
import { useCart, type NewCartItem } from '../store'
import {
  initialState,
  isSingleChoice,
  minOf,
  NOTE_MAX,
  setNote,
  setQuantity,
  stateFromLine,
  toggleOption,
  viewOf,
  groupsOf,
  type FormState,
} from '@/features/catalog/productForm'
import type { Menu, MenuGroup, MenuProduct } from '@/features/catalog/types'
import { ProductImage } from '@/features/catalog/components/ProductImage'

interface Props {
  open: boolean
  menu: Menu
  product: MenuProduct
  /** Cart line being edited, if any. */
  lineId: string | null
  onClose: () => void
}

const ruleText = (g: MenuGroup): string => {
  const min = minOf(g)
  if (isSingleChoice(g)) return g.isRequired ? 'Obligatorio · elegí 1' : 'Opcional · elegí 1'
  if (min > 0)
    return min === g.maxSelect ? `Obligatorio · elegí ${min}` : `Obligatorio · de ${min} a ${g.maxSelect}`
  return `Opcional · hasta ${g.maxSelect}`
}

/** Product sheet: bottom sheet on phones, modal on desktop. Options are validated live against the group rules. */
export function ProductSheet({ open, menu, product, lineId, onClose }: Props) {
  const add = useCart((s) => s.add)
  const replaceItem = useCart((s) => s.replaceItem)
  const editing = useCart((s) => (lineId ? s.items.find((i) => i.id === lineId) : undefined))
  const [state, setState] = useState<FormState>(() =>
    editing ? stateFromLine(menu, product, editing) : initialState(menu, product),
  )
  const [showErrors, setShowErrors] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const view = useMemo(() => viewOf(menu, product, state), [menu, product, state])
  const groups = groupsOf(menu, product)
  const issueByGroup = new Map(view.issues.map((i) => [i.groupId, i.message]))

  const submit = () => {
    if (!view.canAdd) {
      setShowErrors(true)
      document
        .getElementById(`group-${view.issues[0]?.groupId ?? ''}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    const item: NewCartItem = {
      productId: product.id,
      quantity: state.quantity,
      modifierIds: view.modifierIds,
      note: state.note.trim(),
      snapshot: {
        name: product.name,
        unitPrice: view.unitPrice,
        imagePublicId: product.imagePublicId,
        modifierNames: view.modifierNames,
      },
    }
    if (lineId) {
      replaceItem(lineId, item)
      toast.success('Cambios guardados')
      onClose()
      return
    }
    add(item)
    toast.success('Sumado a la comanda', { description: product.name })
    const source = heroRef.current
    onClose()
    // The sheet closes instantly; the thumbnail still flies from where the photo was.
    void flyToCart(source)
  }

  return (
    <Sheet open={open} onClose={onClose} title={product.name} hideTitle>
      <div ref={heroRef} className="-mx-5 -mt-1 mb-4">
        <ProductImage
          publicId={product.imagePublicId}
          alt={product.name}
          sizes="(min-width: 768px) 640px, 100vw"
          priority
          className="aspect-square max-h-72 w-full border-y-2 border-(--shadow-ink)"
        />
      </div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl leading-tight">{product.name}</h3>
          {product.unitLabel && <p className="text-sm text-ink-soft">{product.unitLabel}</p>}
          {product.description && <p className="mt-1 text-ink-soft">{product.description}</p>}
        </div>
        {product.spicyLevel > 0 && <SpiceLevel level={product.spicyLevel} showLabel className="shrink-0" />}
      </div>

      {product.type === 'combo' && product.combo.length > 0 && (
        <p className="mb-4 rounded-md bg-ink/10 p-3 text-sm">
          Incluye también:{' '}
          {product.combo
            .map(
              (c) =>
                `${c.quantity > 1 ? `${c.quantity} × ` : ''}${menu.productsById[c.productId]?.name ?? ''}`,
            )
            .join(', ')}
          .
        </p>
      )}

      <div className="space-y-5">
        {groups.map((g) => {
          const chosen = state.selection[g.id] ?? []
          const single = isSingleChoice(g)
          const error = showErrors ? issueByGroup.get(g.id) : undefined
          const full = !single && chosen.length >= g.maxSelect
          return (
            <fieldset
              key={g.id}
              id={`group-${g.id}`}
              className="scroll-mt-4 rounded-md border-2 border-line p-3"
            >
              <legend className="px-1 font-display text-lg leading-tight">{g.name}</legend>
              <p className="mb-2 text-sm text-ink-soft">{ruleText(g)}</p>
              <ul className="grid gap-1.5">
                {g.modifiers.map((m) => {
                  const checked = chosen.includes(m.id)
                  const disabled = !m.isAvailable || (!checked && full)
                  const inputId = `m-${m.id}`
                  return (
                    <li key={m.id}>
                      <label
                        htmlFor={inputId}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border-2 px-3 py-1.5 transition-colors duration-150',
                          checked ? 'border-ink bg-ink/10' : 'border-line hover:border-ink',
                          disabled && 'cursor-not-allowed opacity-55',
                        )}
                      >
                        <input
                          id={inputId}
                          type={single ? 'radio' : 'checkbox'}
                          name={single ? `group-${g.id}` : undefined}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            setState((s) => toggleOption(s, g, m.id))
                          }}
                          className="size-5 shrink-0 accent-chile"
                        />
                        <span className="flex-1">{m.name}</span>
                        {!m.isAvailable ? (
                          <span className="text-sm text-ink-soft">Agotado</span>
                        ) : m.priceDelta !== 0 ? (
                          <span className="font-mono text-sm tabular-nums">
                            {m.priceDelta > 0 ? '+' : '−'} {formatARS(Math.abs(m.priceDelta))}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  )
                })}
              </ul>
              {error && (
                <p role="alert" className="mt-2 text-sm font-bold text-brand-text">
                  {error}
                </p>
              )}
            </fieldset>
          )
        })}

        <div>
          <label htmlFor="line-note" className="mb-1 block font-display text-lg">
            ¿Alguna aclaración?
          </label>
          <textarea
            id="line-note"
            rows={2}
            maxLength={NOTE_MAX}
            placeholder="Ej.: sin cebolla porfa"
            value={state.note}
            onChange={(e) => {
              setState((s) => setNote(s, e.target.value))
            }}
            className="w-full rounded-md border-2 border-line bg-card p-3 text-base"
          />
          <p className="text-right text-xs text-ink-soft">
            {state.note.length}/{NOTE_MAX}
          </p>
        </div>
      </div>

      <div className="sticky -bottom-5 -mx-5 mt-5 flex items-center gap-3 border-t-2 border-line bg-card px-5 py-3">
        <QuantityStepper
          value={state.quantity}
          onChange={(q) => {
            setState((s) => setQuantity(s, q))
          }}
          label={`Cantidad de ${product.name}`}
        />
        <Button size="lg" className="flex-1" onClick={submit} aria-disabled={!view.canAdd || undefined}>
          {lineId ? 'Guardar' : 'Sumar'} · {formatARS(view.total)}
        </Button>
      </div>
      {showErrors && view.issues.length > 0 && (
        <p role="alert" className="mt-2 text-sm text-brand-text">
          Falta elegir: {view.issues.map((i) => i.groupName).join(', ')}.
        </p>
      )}
    </Sheet>
  )
}
