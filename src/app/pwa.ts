import { create } from 'zustand'

interface UpdateState {
  /** A new version is downloaded and waiting. */
  ready: boolean
  /** Activates it and reloads. Set once the service worker is registered. */
  apply: () => void
}

export const useUpdate = create<UpdateState>()(() => ({ ready: false, apply: () => undefined }))

/**
 * Registers the service worker (production builds only). New versions never replace the running page by themselves:
 * the kitchen may have an order open, so the user decides when to reload ("Actualizar").
 */
export async function registerServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  const update = registerSW({
    onNeedRefresh() {
      useUpdate.setState({ ready: true })
    },
  })
  useUpdate.setState({ apply: () => void update(true) })
}
