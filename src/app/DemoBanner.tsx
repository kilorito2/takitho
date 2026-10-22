import { Link, Outlet } from 'react-router'
import { DEMO_LOGIN } from '@/demo/credentials'

/** Shown only in the portfolio build: says what this is and links the three surfaces, with the demo login. */
export function DemoBanner() {
  if (import.meta.env.VITE_DEMO !== 'true') return null
  return (
    <aside
      aria-label="Modo demo"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-carbon px-3 py-2 text-sm text-tortilla"
    >
      <span>
        <strong>Demo de portafolio:</strong> sin servidor real, los datos viven en esta pestaña.
      </span>
      <nav aria-label="Pantallas de la demo" className="flex gap-3 font-bold">
        <Link to="/menu" className="underline underline-offset-2">
          Cliente
        </Link>
        <Link to="/cocina" className="underline underline-offset-2">
          Cocina
        </Link>
        <Link to="/admin" className="underline underline-offset-2">
          Admin
        </Link>
      </nav>
      <span className="text-tortilla/80">
        Personal: {DEMO_LOGIN.email} / {DEMO_LOGIN.password}
      </span>
    </aside>
  )
}

/** Root route: the banner above whatever page is showing (inside the router so its links navigate without reloading). */
export function DemoShell() {
  return (
    <>
      <DemoBanner />
      <Outlet />
    </>
  )
}
