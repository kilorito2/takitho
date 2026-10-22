import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { registerServiceWorker } from '@/app/pwa'
import '@/styles/index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

async function start(container: HTMLElement) {
  // Portfolio build: swap Supabase for the in-browser backend before anything talks to it (tree-shaken out of real builds).
  if (import.meta.env.VITE_DEMO === 'true') (await import('@/demo/install')).installDemo()
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  if (import.meta.env.VITE_DEMO !== 'true') void registerServiceWorker()
}

void start(root)
