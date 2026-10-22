import { expect, test } from '@playwright/test'
import { fillContact, next, openCart, openShop, quickAdd } from './support/helpers.ts'

// Acceptance: "pedido de retiro pagado en efectivo" (SPEC §12 A2) — and the order shows up live without reloading.
test('retiro en efectivo: arma el pedido, confirma y lo ve avanzar en vivo', async ({ page }) => {
  const backend = await openShop(page)
  await page.goto('/menu')

  // A product without options goes straight to the tray…
  await quickAdd(page, 'Guacamole con totopos')

  // …and one with options asks for them (tortilla is required and preselected; extras are optional and cost money).
  await page.getByRole('button', { name: 'Elegir Tacos al pastor con piña' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tacos al pastor con piña' })
  await expect(sheet.getByText('Obligatorio · elegí 1').first()).toBeVisible()
  await sheet.getByLabel('Harina').check()
  await sheet.getByLabel('Queso extra').check()
  await expect(sheet.getByRole('button', { name: /^Sumar · \$\s?8\.100/ })).toBeVisible() // 7.200 + 900
  await sheet.getByRole('button', { name: /^Sumar · / }).click()

  const drawer = await openCart(page)
  await expect(drawer.getByTestId('cart-line')).toHaveCount(2)
  await drawer.getByRole('link', { name: /^Pedir · / }).click()

  // Step 1 — how
  await expect(page).toHaveURL(/\/checkout$/)
  await page.getByLabel('Retiro en el local').check()
  await next(page)
  // Step 2 — when (shop is open: as soon as possible)
  await expect(page.getByLabel('Lo antes posible')).toBeChecked()
  await next(page)
  // Step 3 — who
  await fillContact(page)
  await next(page)
  // Step 4 — pay with cash and say how much (the change is calculated)
  await page.getByLabel('Efectivo').check()
  await page.getByLabel('Otro monto').first().fill('20000')
  await expect(page.getByText(/Tu vuelto: \$\s?5\.000/)).toBeVisible() // 20.000 − (6.900 guacamole + 8.100 tacos)
  await next(page)
  // Step 5 — confirm
  await expect(page.getByRole('heading', { name: 'Revisá y confirmá' })).toBeVisible()
  await page.getByRole('button', { name: /^Confirmar pedido/ }).click()

  // Tracking page
  await expect(page).toHaveURL(/\/pedido\/TK-0001\?t=/)
  await expect(page.getByTestId('order-code')).toHaveText('TK-0001')
  await expect(page.getByText('¡Sale! Recibimos tu pedido').first()).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Recibimos tu pedido' })).toBeAttached()

  // The kitchen moves it forward: the customer sees it without reloading.
  backend.advance('TK-0001')
  await expect(page.getByText('Está en el comal').first()).toBeVisible()
  backend.advance('TK-0001')
  await expect(page.getByText('¡Órale, ya está tu orden!').first()).toBeVisible()

  // The server stored what the server computed.
  const stored = backend.state.orders[0]?.payload
  expect(stored?.totals.total).toBe(6900 + 8100)
  expect(stored?.payment).toEqual({ method: 'cash', cash_paid_with: 20000 })
  expect(stored?.initial_status).toBe('received')

  // "Mis pedidos" remembers it on this device.
  await page.goto('/mis-pedidos')
  await expect(page.getByText('TK-0001')).toBeVisible()
})
