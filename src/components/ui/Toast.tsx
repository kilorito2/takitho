import { useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'
import { useToastStore, type ToastTone } from './toastStore'

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

const tones: Record<ToastTone, string> = {
  success: 'border-nopal',
  error: 'border-chile',
  info: 'border-azulejo',
}

export function Toaster() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)
  const region = useRef<HTMLDivElement>(null)

  // Popover top layer keeps toasts above an open <dialog>.
  useEffect(() => {
    const el = region.current
    if (el && !el.matches(':popover-open')) el.showPopover()
  }, [])

  return (
    <div
      ref={region}
      popover="manual"
      role="region"
      aria-label="Avisos"
      className="pointer-events-none fixed inset-x-0 top-auto bottom-4 m-0 flex w-full flex-col items-center gap-2 border-0 bg-transparent p-0 px-4"
    >
      {items.map((t) => {
        const Icon = icons[t.tone]
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-pop-in items-start gap-3 rounded-md border-2 bg-card p-3 text-ink shadow-chunk',
              tones[t.tone],
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'mt-0.5 size-5 shrink-0',
                t.tone === 'success' && 'text-good',
                t.tone === 'error' && 'text-brand-text',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t.title}</p>
              {t.description && <p className="text-sm text-ink-soft">{t.description}</p>}
            </div>
            <IconButton
              aria-label="Cerrar aviso"
              onClick={() => {
                dismiss(t.id)
              }}
              className="-my-1 -mr-1 size-9"
            >
              <X aria-hidden className="size-4" />
            </IconButton>
          </div>
        )
      })}
    </div>
  )
}
