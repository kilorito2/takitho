import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

interface DialogBaseProps {
  open: boolean
  onClose: () => void
  title: string
  /** Optional line under the title; wired to aria-describedby. */
  description?: string | undefined
  children: ReactNode
  className?: string | undefined
  /** Hide the visible title (it stays available to screen readers). */
  hideTitle?: boolean | undefined
}

/**
 * Native <dialog>: the browser handles the focus trap, Esc, inert background and focus return.
 * We only sync the `open` prop, close on backdrop click and keep scroll locked (see `.tk-dialog` in index.css).
 */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onCancel = (event: Event) => {
      event.preventDefault() // let React state drive the closing so the exit transition runs
      onClose()
    }
    el.addEventListener('cancel', onCancel)
    return () => {
      el.removeEventListener('cancel', onCancel)
    }
  }, [onClose])
  return ref
}

function DialogShell({
  variant,
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideTitle = false,
}: DialogBaseProps & { variant: 'modal' | 'sheet' }) {
  const ref = useDialog(open, onClose)
  const titleId = useId()
  const descId = useId()
  const drag = useRef<{ startY: number; dy: number } | null>(null)

  const onHandleDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startY: event.clientY, dy: 0 }
  }
  const onHandleMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = ref.current
    if (!d || !el) return
    d.dy = Math.max(0, event.clientY - d.startY)
    el.style.transition = 'none'
    el.style.transform = `translateY(${d.dy}px)`
  }
  const onHandleUp = () => {
    const d = drag.current
    const el = ref.current
    drag.current = null
    if (!el) return
    el.style.transition = ''
    el.style.transform = ''
    if (d && d.dy > 110) onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-variant={variant}
      className={cn('tk-dialog', className)}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose() // click on the backdrop
      }}
    >
      <div className="flex max-h-[inherit] min-h-0 flex-col">
        {variant === 'sheet' && (
          <div
            aria-hidden
            className="tk-sheet-handle flex h-6 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            <span className="h-1.5 w-12 rounded-full bg-ink/30" />
          </div>
        )}
        <header className="flex items-start gap-3 px-5 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={cn('font-display text-2xl text-ink', hideTitle && 'sr-only')}>
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-ink-soft">
                {description}
              </p>
            )}
          </div>
          <IconButton aria-label="Cerrar" onClick={onClose} className="-mt-1 -mr-2">
            <X aria-hidden className="size-6" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </div>
    </dialog>
  )
}

/** Centered dialog (confirmations, short forms). */
export function Modal(props: DialogBaseProps) {
  return <DialogShell variant="modal" {...props} />
}

/** Bottom sheet on phones, centered modal from `md` up (product sheet, cart). */
export function Sheet(props: DialogBaseProps) {
  return <DialogShell variant="sheet" {...props} />
}
