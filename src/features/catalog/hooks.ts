import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/realtime-js'
import { storeStatus, type StoreStatus } from '@/lib/hours'
import { realtime } from '@/lib/supabase'
import { fetchHours, fetchMenu, fetchPromos, fetchStore, fetchZones } from './api'

export const menuKeys = {
  menu: ['menu'] as const,
  store: ['store'] as const,
  hours: ['hours'] as const,
  zones: ['zones'] as const,
  promos: ['promos'] as const,
}

/** The menu rarely changes, but the owner can sell out an item at any moment → short staleness + realtime. */
export const useMenu = () => useQuery({ queryKey: menuKeys.menu, queryFn: fetchMenu, staleTime: 60_000 })
export const useStore = () =>
  useQuery({ queryKey: menuKeys.store, queryFn: fetchStore, staleTime: 15_000, refetchInterval: 30_000 })
export const useHours = () =>
  useQuery({ queryKey: menuKeys.hours, queryFn: fetchHours, staleTime: 5 * 60_000 })
export const useZones = () =>
  useQuery({ queryKey: menuKeys.zones, queryFn: fetchZones, staleTime: 5 * 60_000 })
export const usePromos = () =>
  useQuery({ queryKey: menuKeys.promos, queryFn: fetchPromos, staleTime: 5 * 60_000 })

/**
 * Keeps the menu live: each change to products/modifiers/categories invalidates the cached menu, so a price
 * change or "agotado" shows up without reloading (acceptance A6). Mount once at the app shell.
 */
export function useMenuRealtime(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    // Not on the critical path: connect once the page is idle. Anything that changed before the socket was up is
    // picked up by the refetch on SUBSCRIBED below.
    let channel: ReturnType<ReturnType<typeof realtime>['channel']> | undefined
    const connect = () => {
      channel = realtime()
        .channel('menu-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'modifiers' }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, refresh)
        .subscribe((status) => {
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) refresh()
        })
    }
    const refresh = () => void queryClient.invalidateQueries({ queryKey: menuKeys.menu })
    const idle = window.setTimeout(connect, 1500)
    return () => {
      window.clearTimeout(idle)
      if (channel) void realtime().removeChannel(channel)
    }
  }, [queryClient])
}

/** A clock that ticks every `ms` so "open/closed" flips on its own while the page stays open. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date())
    }, ms)
    return () => {
      window.clearInterval(id)
    }
  }, [ms])
  return now
}

export interface LiveStoreStatus {
  /** Settings or hours are still loading. */
  ready: boolean
  status: StoreStatus | null
}

/** Open/closed/paused computed with the same pure module the server uses (the server stays authoritative). */
export function useStoreStatus(): LiveStoreStatus {
  const store = useStore()
  const hours = useHours()
  const now = useNow()
  return useMemo(() => {
    if (!store.data || !hours.data) return { ready: false, status: null }
    return {
      ready: true,
      status: storeStatus({
        now,
        shifts: hours.data,
        tz: store.data.timezone,
        isPaused: store.data.isPaused,
        isClosedManually: store.data.isClosedManually,
        acceptsScheduledWhenClosed: store.data.acceptsScheduledWhenClosed,
      }),
    }
  }, [store.data, hours.data, now])
}
