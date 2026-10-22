import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
import { TalaveraStrip } from '@/components/illustrations/Decor'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Toaster } from '@/components/ui/Toast'
import { CartButton } from '@/features/cart/components/CartButton'
import { useUi } from '@/features/cart/ui'
import { useMenuRealtime, useStore } from '@/features/catalog/hooks'
import { isFilled, whatsappLink } from '@/lib/links'
import { cn } from '@/lib/cn'

// The drawer and the product sheet are the heaviest parts of the shell and nobody sees them on arrival: they load
// in the background once the page is idle (so the first tap is instant) and are mounted from the first time they open.
const loadCartDrawer = () =>
  import('@/features/cart/components/CartDrawer').then((m) => ({ default: m.CartDrawer }))
const loadProductSheetHost = () =>
  import('@/features/cart/components/ProductSheetHost').then((m) => ({ default: m.ProductSheetHost }))
const CartDrawer = lazy(loadCartDrawer)
const ProductSheetHost = lazy(loadProductSheetHost)

function Overlays() {
  const wanted = useUi((s) => s.cartOpen || s.sheet !== null)
  const [mounted, setMounted] = useState(false)
  // Adjusting state while rendering: once something was opened, the overlays stay mounted for their exit transition.
  if (wanted && !mounted) setMounted(true)
  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadCartDrawer()
      void loadProductSheetHost()
    }, 3000)
    return () => {
      window.clearTimeout(id)
    }
  }, [])
  return mounted ? (
    <Suspense fallback={null}>
      <CartDrawer />
      <ProductSheetHost />
    </Suspense>
  ) : null
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'hidden min-h-11 items-center rounded-md px-3 font-bold sm:inline-flex',
    isActive ? 'bg-ink text-paper-bg' : 'text-ink hover:bg-ink/10',
  )

export function CustomerLayout() {
  useMenuRealtime()
  const store = useStore()
  const info = store.data
  const wa = info ? whatsappLink(info.whatsapp) : null

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 border-b-2 border-line bg-paper-bg/95 backdrop-blur-[2px]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2">
          <Link to="/" aria-label="Takitho, ir al inicio" className="flex min-h-11 items-center">
            <Logo variant="full" className="h-10 w-auto" />
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1">
            <NavLink to="/menu" className={navLink}>
              Menú
            </NavLink>
            <NavLink to="/mis-pedidos" className={navLink}>
              Mis pedidos
            </NavLink>
            <ThemeToggle />
            <CartButton />
          </nav>
        </div>
        <TalaveraStrip />
      </header>
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-carbon px-4 py-8 pb-24 text-tortilla md:pb-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-6 text-sm">
          <div>
            <p className="font-display text-xl">Takitho</p>
            <p className="mt-1 text-tortilla/80">
              {info && isFilled(info.address) ? info.address : '[COMPLETAR: dirección]'}
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link to="/mis-pedidos" className="underline underline-offset-4">
              Mis pedidos
            </Link>
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </footer>
      <Overlays />
      <Toaster />
      <ScrollRestoration />
    </div>
  )
}
