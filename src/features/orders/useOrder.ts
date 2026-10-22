import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { api } from '@/lib/client'
import { realtime } from '@/lib/supabase'
import type { PublicOrder } from '@/types/api'

const key = (code: string, token: string) => ['order', code, token] as const

/**
 * Live order tracking. Updates arrive on a public Realtime broadcast channel keyed by the secret token (ADR-0006),
 * and a 15 s poll is the fallback for networks that block websockets. Both just refetch the authoritative order.
 */
export function useOrder(code: string, token: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery<PublicOrder, ApiError>({
    queryKey: key(code, token ?? ''),
    queryFn: ({ signal }) => api().call<PublicOrder>('get-order', { code, token }, { signal }),
    enabled: token !== null,
    refetchInterval: (q) => {
      const status = q.state.data?.status
      return status === 'delivered' || status === 'cancelled' ? false : 15_000
    },
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof ApiError && error.code === 'NOT_FOUND') && count < 2,
  })

  useEffect(() => {
    if (!token) return
    const channel = realtime()
      .channel(`order:${token}`, { config: { private: false } })
      .on('broadcast', { event: 'order_update' }, () => {
        void queryClient.invalidateQueries({ queryKey: key(code, token) })
      })
      .subscribe()
    return () => {
      void realtime().removeChannel(channel)
    }
  }, [code, token, queryClient])

  return query
}
