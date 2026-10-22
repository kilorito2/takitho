import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { TortillaLoader } from '@/components/ui/TortillaLoader'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { canAccess, homeFor, type StaffRole } from './roles'
import { useStaff } from './store'

/**
 * Route guard for the staff areas. It is a convenience (nobody sees a screen they cannot use);
 * the real barrier is RLS and the role checks inside the SQL functions.
 */
export function RequireRole({ roles, children }: { roles: readonly StaffRole[]; children: ReactNode }) {
  const { status, staff, signOut } = useStaff()
  const location = useLocation()

  if (status === 'loading') return <TortillaLoader className="min-h-dvh justify-center" />
  if (status === 'signed_out') {
    return (
      <Navigate to={`/staff/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
    )
  }
  if (status === 'no_access' || !staff) {
    return (
      <Blocked
        title="Esta cuenta no tiene acceso"
        text="Entraste, pero tu usuario no está activo como personal de Takitho. Pedile al administrador que lo habilite."
      >
        <button
          type="button"
          className={buttonClasses({ variant: 'outline' })}
          onClick={() => void signOut()}
        >
          Salir
        </button>
      </Blocked>
    )
  }
  if (!canAccess(staff.role, roles)) {
    return (
      <Blocked title="No podés ver esta pantalla" text="Tu rol no incluye esta parte del sistema.">
        <Link to={homeFor(staff.role)} className={buttonClasses({ variant: 'primary' })}>
          Ir a mi pantalla
        </Link>
      </Blocked>
    )
  }
  return children
}

function Blocked({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-4 px-4 text-center">
      <h1 className="text-4xl">{title}</h1>
      <p className="text-ink-soft">{text}</p>
      <div className="flex justify-center">{children}</div>
    </main>
  )
}
