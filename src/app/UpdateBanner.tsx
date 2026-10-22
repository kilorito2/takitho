import { RefreshCw } from 'lucide-react'
import { useUpdate } from './pwa'

/** "Hay una versión nueva": appears over everything, including the kitchen board, and waits for a tap. */
export function UpdateBanner() {
  const ready = useUpdate((s) => s.ready)
  const apply = useUpdate((s) => s.apply)
  if (!ready) return null
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-md border-2 border-(--shadow-ink) bg-maiz p-3 text-carbon shadow-chunk"
    >
      <p className="font-bold">Hay una versión nueva de Takitho.</p>
      <button
        type="button"
        onClick={apply}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-carbon bg-carbon px-4 font-display text-tortilla"
      >
        <RefreshCw aria-hidden className="size-4" /> Actualizar
      </button>
    </div>
  )
}
