import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { toast } from '@/components/ui/toastStore'
import type { OrderStatus } from '@/lib/orderStatus'
import { staffClient } from '@/lib/supabaseStaff'
import { advanceOrder, fetchKitchenSettings, fetchOrders } from './api'
import { columnOf, type KitchenOrder } from './model'

export const kitchenKeys = {
  orders: ['kitchen', 'orders'] as const,
  settings: ['kitchen', 'settings'] as const,
}

export type Connection = 'connecting' | 'online' | 'offline'

/**
 * The live board: Postgres Changes tell us *something* changed and we refetch the authoritative list (cheap, and
 * immune to a missed event). The same refetch is the recovery after a dropped connection; a 30 s poll is the net
 * under the net (ADR-0006).
 */
export function useKitchenOrders() {
  const queryClient = useQueryClient()
  const [connection, setConnection] = useState<Connection>('connecting')
  const wasOnline = useRef(false)

  const query = useQuery({
    queryKey: kitchenKeys.orders,
    queryFn: () => fetchOrders(),
    refetchInterval: 30_000,
    refetchOnReconnect: true,
    staleTime: 0,
  })

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: kitchenKeys.orders })
    const channel = staffClient()
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          setConnection('online')
          // Events may have been missed while we were away: never trust only the stream.
          if (wasOnline.current) refresh()
          wasOnline.current = true
        } else {
          // CLOSED, CHANNEL_ERROR or TIMED_OUT: supabase-js keeps retrying on its own; we just say so.
          setConnection('offline')
        }
      })
    const goOffline = () => {
      setConnection('offline')
    }
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('offline', goOffline)
      void staffClient().removeChannel(channel)
    }
  }, [queryClient])

  return { ...query, connection: query.isError ? 'offline' : connection }
}

export const useKitchenSettings = () =>
  useQuery({ queryKey: kitchenKeys.settings, queryFn: fetchKitchenSettings, staleTime: 5 * 60_000 })

/** One-tap step forward with an optimistic move; a refused step (someone else got there first) reloads the truth. */
export function useAdvanceOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ order, to }: { order: KitchenOrder; to: OrderStatus }) => advanceOrder(order.id, to),
    onMutate: async ({ order, to }) => {
      await queryClient.cancelQueries({ queryKey: kitchenKeys.orders })
      const previous = queryClient.getQueryData<KitchenOrder[]>(kitchenKeys.orders)
      queryClient.setQueryData<KitchenOrder[]>(kitchenKeys.orders, (list) =>
        list?.map((o) => (o.id === order.id ? { ...o, status: to } : o)),
      )
      return { previous }
    },
    onError: (_error, { order }, context) => {
      if (context?.previous) queryClient.setQueryData(kitchenKeys.orders, context.previous)
      toast.error(
        `No se pudo mover ${order.code}. Puede que ya lo haya movido otra persona: lo actualizamos.`,
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: kitchenKeys.orders }),
  })
}

/**
 * Detects orders that appear on the board after the first load (new, or just paid online) so the screen can
 * ring and highlight them. The first load never counts: reopening the app must not ring for old orders.
 */
export function useFreshOrders(
  orders: readonly KitchenOrder[] | undefined,
  onFresh: (fresh: KitchenOrder[]) => void,
) {
  const seen = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const callback = useRef(onFresh)
  useEffect(() => {
    callback.current = onFresh
  })

  useEffect(() => {
    if (!orders) return
    const onBoardNew = orders.filter((o) => columnOf(o.status) === 'new')
    if (seen.current === null) {
      seen.current = new Set(orders.map((o) => o.id))
      return
    }
    const known = seen.current
    const arrived = onBoardNew.filter((o) => !known.has(o.id))
    for (const o of orders) known.add(o.id)
    if (arrived.length === 0) return
    setFresh((current) => new Set([...current, ...arrived.map((o) => o.id)]))
    callback.current(arrived)
  }, [orders])

  const dismiss = (id: string) => {
    setFresh((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }
  return { fresh, dismiss }
}

/** Keeps the screen on while the board is open (ADR-0011). Silent where unsupported. */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = () => {
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (cancelled) void sentinel.release()
          else lock = sentinel
        })
        .catch(() => undefined)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [enabled])
}

/** Blinks the tab title while there are unseen orders and the tab is in the background. */
export function useTitleAlert(count: number): void {
  useEffect(() => {
    if (count === 0) return
    const base = document.title
    let on = false
    const id = window.setInterval(() => {
      on = !on
      document.title = on ? `(${count}) ¡Pedido nuevo!` : base
    }, 1000)
    return () => {
      window.clearInterval(id)
      document.title = base
    }
  }, [count])
}
