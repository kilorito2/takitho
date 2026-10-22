import { createBrowserRouter, type RouteObject } from 'react-router'
import { CustomerLayout } from './layouts/CustomerLayout'
import { ErrorPage } from '@/features/errors/ErrorPage'
import { NotFoundPage } from '@/features/errors/NotFoundPage'
import { HomePage } from '@/features/home/HomePage'
import { MenuPage } from '@/features/menu/MenuPage'
import { TortillaLoader } from '@/components/ui/TortillaLoader'

const routes: RouteObject[] = [
  {
    element: <CustomerLayout />,
    hydrateFallbackElement: <TortillaLoader className="min-h-dvh justify-center" />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'menu', element: <MenuPage /> },
      {
        path: 'checkout',
        lazy: () => import('@/features/checkout/CheckoutPage').then((m) => ({ Component: m.CheckoutPage })),
      },
      {
        path: 'pedido/:codigo',
        lazy: () => import('@/features/orders/TrackingPage').then((m) => ({ Component: m.TrackingPage })),
      },
      {
        path: 'mis-pedidos',
        lazy: () => import('@/features/orders/MyOrdersPage').then((m) => ({ Component: m.MyOrdersPage })),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

// Staff areas live outside the customer layout (their own chrome) and are lazy: customers never download them.
routes.push(
  {
    path: '/staff/login',
    hydrateFallbackElement: <TortillaLoader className="min-h-dvh justify-center" />,
    errorElement: <ErrorPage />,
    lazy: () => import('@/features/staff/StaffLoginPage').then((m) => ({ Component: m.StaffLoginPage })),
  },
  {
    path: '/cocina',
    hydrateFallbackElement: <TortillaLoader className="min-h-dvh justify-center" />,
    errorElement: <ErrorPage />,
    lazy: () => import('@/features/kitchen/KitchenPage').then((m) => ({ Component: m.KitchenPage })),
  },
  {
    path: '/admin',
    hydrateFallbackElement: <TortillaLoader className="min-h-dvh justify-center" />,
    errorElement: <ErrorPage />,
    lazy: () => import('@/features/admin/AdminLayout').then((m) => ({ Component: m.AdminLayout })),
    children: [
      {
        index: true,
        lazy: () =>
          import('@/features/admin/pages/DashboardPage').then((m) => ({ Component: m.DashboardPage })),
      },
      {
        path: 'pedidos',
        lazy: () => import('@/features/admin/pages/OrdersPage').then((m) => ({ Component: m.OrdersPage })),
      },
      {
        path: 'menu',
        lazy: () =>
          import('@/features/admin/pages/MenuAdminPage').then((m) => ({ Component: m.MenuAdminPage })),
      },
      {
        path: 'promos',
        lazy: () => import('@/features/admin/pages/PromosPage').then((m) => ({ Component: m.PromosPage })),
      },
      {
        path: 'local',
        lazy: () => import('@/features/admin/pages/LocalPage').then((m) => ({ Component: m.LocalPage })),
      },
      {
        path: 'mesas',
        lazy: () => import('@/features/admin/pages/TablesPage').then((m) => ({ Component: m.TablesPage })),
      },
      {
        path: 'equipo',
        lazy: () => import('@/features/admin/pages/TeamPage').then((m) => ({ Component: m.TeamPage })),
      },
      {
        path: 'pedidos/:id',
        lazy: () =>
          import('@/features/admin/pages/OrderDetailPage').then((m) => ({ Component: m.OrderDetailPage })),
      },
    ],
  },
)

// Component gallery: only exists in dev builds so it never ships.
if (import.meta.env.DEV) {
  routes.push({
    path: '/_kit',
    hydrateFallbackElement: <TortillaLoader className="min-h-dvh justify-center" />,
    lazy: () => import('@/features/kit/KitPage').then((m) => ({ Component: m.KitPage })),
  })
}

export const router = createBrowserRouter(routes)
