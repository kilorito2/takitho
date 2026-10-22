import { Clock, PauseCircle } from 'lucide-react'
import { formatClock } from '@/lib/formatClock'
import { useStore, useStoreStatus } from '../hooks'

/**
 * Tells the truth about the shop right now. Closed → "Estamos cerrados, prendemos el comal a las 19 h"
 * (immediate orders are blocked, scheduling stays available). Paused → short pause message.
 */
export function StoreBanner({ className }: { className?: string }) {
  const { ready, status } = useStoreStatus()
  const store = useStore()
  if (!ready || !status || !store.data) return null
  if (status.canOrderNow) return null

  const tz = store.data.timezone
  const reopen = status.nextOpenAt
  let text: string
  if (status.reason === 'paused')
    text = 'Estamos con mucho trabajo y pausamos los pedidos un rato. Podés programar uno para más tarde.'
  else if (status.reason === 'manual' || !reopen) text = 'Hoy no estamos tomando pedidos.'
  else text = `Estamos cerrados, prendemos el comal a las ${formatClock(reopen, tz)}.`
  const Icon = status.reason === 'paused' ? PauseCircle : Clock
  return (
    <p
      role="status"
      className={`flex items-start gap-3 rounded-md border-2 border-(--shadow-ink) bg-maiz p-3 text-carbon shadow-chunk-sm ${className ?? ''}`}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <span className="font-bold">
        {text}
        {status.canSchedule && (
          <span className="block font-normal">Igual podés programar tu pedido para cuando abramos.</span>
        )}
      </span>
    </p>
  )
}
