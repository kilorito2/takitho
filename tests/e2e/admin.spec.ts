import { expect, test } from '@playwright/test'
import { openShop, orderCashPickup, staffLogin } from './support/helpers.ts'

const DESKTOP = { width: 1280, height: 860 }

test('admin: resumen, pedidos y cancelación con motivo', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: DESKTOP,
  })
  const admin = await context.newPage()
  const customer = await context.newPage()
  const backend = await openShop(admin)
  backend.staff.role = 'admin'
  await backend.install(customer)
  await customer.clock.install({ time: backend.now })

  // Two orders to look at.
  await orderCashPickup(customer, 'Tacos al pastor con piña', 'sin cebolla')
  await orderCashPickup(customer, 'Guacamole con totopos')

  // The private area: an admin lands on /admin after signing in.
  await admin.goto('/admin')
  await expect(admin).toHaveURL(/\/staff\/login\?next=%2Fadmin/)
  await staffLogin(admin, backend, '/admin')
  await expect(admin.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible()

  // "Hoy": two orders, sales and average ticket from the server report.
  await admin.getByRole('button', { name: 'Hoy' }).click()
  const kpis = admin.getByRole('list').filter({ hasText: 'Ticket promedio' })
  await expect(kpis).toContainText('Ventas')
  await expect(kpis.getByText('2', { exact: true })).toBeVisible()
  await expect(admin.getByRole('heading', { name: 'Lo más pedido' })).toBeVisible()

  // Orders list → detail.
  await admin.getByRole('link', { name: 'Pedidos' }).click()
  await expect(admin.getByRole('heading', { name: 'Pedidos', level: 1 })).toBeVisible()
  const row = admin.getByRole('row').filter({ hasText: 'TK-0001' })
  await expect(row).toContainText('Ana Pérez')
  await row.getByRole('link', { name: 'TK-0001' }).click()
  await expect(admin.getByRole('heading', { name: 'TK-0001' })).toBeVisible()
  await expect(admin.getByText('Nota: sin cebolla')).toBeVisible()

  // Cash order: mark it collected; then cancel with a reason (required).
  await admin.getByRole('button', { name: 'Marcar como cobrado' }).click()
  await expect(admin.getByText('Pagado', { exact: false }).first()).toBeVisible()
  await admin.getByRole('button', { name: 'Cancelar pedido' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Cancelar TK-0001' })
  await expect(dialog.getByRole('button', { name: 'Cancelar pedido' })).toBeDisabled()
  await dialog.getByLabel('Motivo').fill('Se quedaron sin carne')
  await dialog.getByRole('button', { name: 'Cancelar pedido' }).click()
  await expect(admin.getByText('Cancelado').first()).toBeVisible()
  await expect(admin.getByText('Motivo de cancelación: Se quedaron sin carne')).toBeVisible()
  expect(backend.state.storedByToken.values().next().value?.status).toBe('cancelled')

  await context.close()
})

test('admin: cada sección carga con sus datos', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: DESKTOP,
  })
  const admin = await context.newPage()
  const backend = await openShop(admin)
  backend.staff.role = 'admin'
  await staffLogin(admin, backend, '/admin/menu')

  await expect(admin.getByRole('heading', { name: 'Menú', level: 1 })).toBeVisible()
  await expect(admin.getByRole('button', { name: 'Editar Tacos al pastor con piña' })).toBeVisible()
  await admin.getByRole('tab', { name: 'Categorías' }).click()
  await expect(admin.getByRole('list', { name: 'Categorías' })).toBeVisible()
  await admin.getByRole('tab', { name: 'Opciones' }).click()
  await expect(admin.getByRole('list', { name: 'Grupos de opciones' })).toBeVisible()

  await admin.getByRole('link', { name: 'Promos' }).click()
  await expect(admin.getByRole('heading', { name: 'Promos y cupones', level: 1 })).toBeVisible()

  await admin.getByRole('link', { name: 'Local' }).click()
  await expect(admin.getByRole('heading', { name: 'Horarios' })).toBeVisible()
  await expect(admin.getByRole('heading', { name: 'Zonas de delivery' })).toBeVisible()
  await expect(admin.getByLabel('Nombre', { exact: true })).toHaveValue('Takitho')

  await admin.getByRole('link', { name: 'Mesas' }).click()
  await expect(admin.getByRole('button', { name: 'Editar mesa 1' })).toBeVisible()

  await admin.getByRole('link', { name: 'Equipo' }).click()
  await expect(admin.getByText(backend.staff.email).first()).toBeVisible()

  await context.close()
})

test('admin: la cocina no entra a la administración', async ({ page }) => {
  const backend = await openShop(page)
  await staffLogin(page, backend, '/admin')
  await expect(page.getByRole('heading', { name: 'No podés ver esta pantalla' })).toBeVisible()
  await page.getByRole('link', { name: 'Ir a mi pantalla' }).click()
  await expect(page).toHaveURL(/\/cocina$/)
})
