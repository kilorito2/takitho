import type { ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props<T extends { id: string }> {
  items: readonly T[]
  /** Accessible name of the list ("Categorías"). */
  label: string
  /** Name of one row, for its handle and arrows ("Tacos"). */
  nameOf: (item: T) => string
  onReorder: (ids: string[]) => void
  children: (item: T) => ReactNode
  /** Disables moving (e.g. while a search filter hides part of the list). */
  disabled?: boolean
}

/**
 * Reorderable list. Three ways to move a row, so nobody depends on a drag: the handle (mouse, touch, and
 * keyboard via dnd-kit: Space, arrows, Space) and explicit up/down buttons.
 */
export function SortableList<T extends { id: string }>({
  items,
  label,
  nameOf,
  onReorder,
  children,
  disabled = false,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from >= 0 && to >= 0) onReorder(arrayMove([...items], from, to).map((i) => i.id))
  }

  const step = (index: number, delta: -1 | 1) => {
    const to = index + delta
    if (to < 0 || to >= items.length) return
    onReorder(arrayMove([...items], index, to).map((i) => i.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <ul aria-label={label} className="space-y-2">
          {items.map((item, index) => (
            <Row
              key={item.id}
              id={item.id}
              name={nameOf(item)}
              first={index === 0}
              last={index === items.length - 1}
              disabled={disabled}
              onStep={(d) => {
                step(index, d)
              }}
            >
              {children(item)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function Row({
  id,
  name,
  first,
  last,
  disabled,
  onStep,
  children,
}: {
  id: string
  name: string
  first: boolean
  last: boolean
  disabled: boolean
  onStep: (delta: -1 | 1) => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-md border-2 border-line bg-card p-2',
        isDragging && 'relative z-10 shadow-chunk',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Mover ${name}: arrastrá, o con teclado Espacio y flechas`}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-md text-ink-soft hover:bg-ink/10 disabled:opacity-40"
      >
        <GripVertical aria-hidden className="size-5" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0">
        <button
          type="button"
          disabled={disabled || first}
          aria-label={`Subir ${name}`}
          onClick={() => {
            onStep(-1)
          }}
          className="grid size-11 place-items-center rounded-md hover:bg-ink/10 disabled:opacity-30"
        >
          <ArrowUp aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          disabled={disabled || last}
          aria-label={`Bajar ${name}`}
          onClick={() => {
            onStep(1)
          }}
          className="grid size-11 place-items-center rounded-md hover:bg-ink/10 disabled:opacity-30"
        >
          <ArrowDown aria-hidden className="size-5" />
        </button>
      </div>
    </li>
  )
}
