import { Link, NavLink, Outlet } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Bell,
  ClipboardList,
  LogOut,
  Percent,
  QrCode,
  Settings,
  UtensilsCrossed,
  Users,
  ChefHat,
} from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Toaster } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { RequireRole } from '@/features/staff/RequireRole'
import { useStaffStore } from '@/features/staff/store'
import { alertsKey, fetchAlerts } from './api'

const NAV = [
  { to: '/admin', label: 'Resumen', icon: BarChart3, end: true },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList, end: false },
  { to: '/admin/menu', label: 'Menú', icon: UtensilsCrossed, end: false },
  { to: '/admin/promos', label: 'Promos', icon: Percent, end: false },
  { to: '/admin/local', label: 'Local', icon: Settings, end: false },
  { to: '/admin/mesas', label: 'Mesas', icon: QrCode, end: false },
  { to: '/admin/equipo', label: 'Equipo', icon: Users, end: false },
] as const

/** Admin shell: sober, sidebar on wide screens and a scrolling strip on phones. The role is checked here and in Postgres. */
export function AdminLayout() {
  return (
    <RequireRole roles={['admin']}>
      <Shell />
    </RequireRole>
  )
}

function Shell() {
  const staff = useStaffStore((s) => s.staff)
  const signOut = useStaffStore((s) => s.signOut)
  const alerts = useQuery({ queryKey: alertsKey, queryFn: fetchAlerts, refetchInterval: 60_000 })
  const open = alerts.data?.length ?? 0

  return (
    <div className="min-h-dvh bg-paper-bg text-ink lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
      >
        Saltar al contenido
      </a>
      <aside className="border-b-2 border-line bg-card lg:sticky lg:top-0 lg:h-dvh lg:border-r-2 lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-start lg:gap-4 lg:py-5">
          <Link to="/admin" aria-label="Takitho, administración">
            <Logo className="h-9 w-auto lg:h-10" />
          </Link>
          <div className="flex items-center gap-1 lg:hidden">
            <ThemeToggle />
          </div>
        </div>
        <nav
          aria-label="Administración"
          className="flex [scrollbar-width:none] gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-md border-2 px-3 font-bold whitespace-nowrap',
                  isActive ? 'border-ink bg-ink text-paper-bg' : 'border-transparent hover:bg-ink/10',
                )
              }
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-2 hidden flex-col gap-2 border-t-2 border-line px-3 py-4 lg:mt-6 lg:flex">
          <ThemeToggle />
          <p className="truncate text-sm text-ink-soft">
            {staff && staff.name.length > 0 ? staff.name : staff?.email}
          </p>
          <Link
            to="/cocina"
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-bold hover:bg-ink/10"
          >
            <ChefHat aria-hidden className="size-5" /> Ir a la cocina
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-bold hover:bg-ink/10"
          >
            <LogOut aria-hidden className="size-5" /> Salir
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {open > 0 && (
          <p
            role="status"
            className="flex items-center gap-2 border-b-2 border-maiz bg-maiz/20 px-4 py-2 font-bold"
          >
            <Bell aria-hidden className="size-5" />
            {open === 1 ? 'Hay 1 aviso sin resolver' : `Hay ${open} avisos sin resolver`}
            <Link to="/admin" className="underline underline-offset-2">
              Verlos en el resumen
            </Link>
          </p>
        )}
        <main id="contenido" className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
