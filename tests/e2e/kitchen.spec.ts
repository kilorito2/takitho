import { expect, test } from '@playwright/test'
import { orderCashPickup, openShop, staffLogin } from './support/helpers.ts'

const TABLET = { width: 1180, height: 820 } // the kitchen runs on a landscape tablet

// Acceptance A3: the kitchen receives the order in under 2 s (with the customer's note highlighted) and moves it
// to delivered, and the customer sees every step without reloading.
test('cocina: recibe el pedido al instante, lo avanza y el cliente lo ve en vivo', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: TABLET,
  })
  const kitchen = await context.newPage()
  const customer = await context.newPage()
  const backend = await openShop(kitchen)
  await backend.install(customer)
  await customer.clock.install({ time: backend.now })

  // The board is private: without a session it sends you to the login, and comes back after signing in.
  await kitchen.goto('/cocina')
  await expect(kitchen).toHaveURL(/\/staff\/login\?next=%2Fcocina/)
  await kitchen.getByLabel('Email').fill(backend.staff.email)
  await kitchen.getByLabel('Contraseña').fill('clave-equivocada')
  await kitchen.getByRole('button', { name: 'Entrar' }).click()
  await expect(
    kitchen.getByRole('alert').filter({ hasText: 'Email o contraseña incorrectos.' }),
  ).toBeVisible()
  await kitchen.getByLabel('Contraseña').fill(backend.staff.password)
  await kitchen.getByRole('button', { name: 'Entrar' }).click()
  await expect(kitchen).toHaveURL(/\/cocina$/)
  await expect(kitchen.getByTestId('connection')).toHaveAttribute('data-state', 'online')
  await expect(kitchen.getByTestId('column-new').getByTestId('kitchen-card')).toHaveCount(0)

  // A customer orders; once their tracking page is up, the comanda is in "Nuevos" within two seconds.
  await orderCashPickup(customer, 'Tacos al pastor con piña', 'sin cebolla, por favor')
  const card = kitchen.getByTestId('column-new').getByTestId('kitchen-card')
  await expect(card).toHaveCount(1, { timeout: 2000 })
  await expect(card).toContainText('TK-0001')
  await expect(card).toContainText('Ana Pérez')
  await expect(card).toContainText('sin cebolla, por favor')
  await expect(card).toContainText('¡Nuevo!')
  await expect(card).toContainText(/Cobrar \$\s?7\.200 en efectivo/)

  // Forward, one tap at a time: Nuevos → En preparación → Listos → Entregados.
  await card.getByRole('button', { name: 'Empezar a preparar' }).click()
  await expect(kitchen.getByTestId('column-preparing').getByTestId('kitchen-card')).toHaveCount(1)
  await expect(customer.getByText('Está en el comal').first()).toBeVisible()

  await kitchen.getByTestId('column-preparing').getByRole('button', { name: 'Listo' }).click()
  await expect(kitchen.getByTestId('column-ready').getByTestId('kitchen-card')).toHaveCount(1)
  await expect(customer.getByText('¡Órale, ya está tu orden!').first()).toBeVisible()

  await kitchen.getByTestId('column-ready').getByRole('button', { name: 'Entregado' }).click()
  await expect(kitchen.getByTestId('column-ready').getByTestId('kitchen-card')).toHaveCount(0)
  await kitchen.getByRole('button', { name: /^Entregados \(1\)/ }).click()
  await expect(kitchen.locator('#done-list').getByText('TK-0001')).toBeVisible()
  expect(backend.state.storedByToken.values().next().value?.status).toBe('delivered')

  await context.close()
})

test('cocina: agotar un producto lo saca del menú de los clientes al instante', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: TABLET,
  })
  const kitchen = await context.newPage()
  const customer = await context.newPage()
  const backend = await openShop(kitchen)
  await backend.install(customer)
  await customer.clock.install({ time: backend.now })

  await customer.goto('/menu')
  await expect(customer.getByRole('button', { name: 'Elegir Flan' })).toBeVisible()

  await staffLogin(kitchen, backend)
  await kitchen.getByRole('button', { name: 'Agotar / Pausar' }).click()
  const panel = kitchen.getByRole('dialog', { name: 'Agotar y pausar' })
  await panel.getByRole('button', { name: 'Agotar Flan' }).click()
  await expect(panel.getByRole('button', { name: 'Volver a habilitar Flan' })).toBeVisible()
  await expect(customer.getByRole('button', { name: 'Flan, agotado' })).toBeDisabled()

  await panel.getByRole('button', { name: 'Pausar pedidos' }).click()
  await expect(panel.getByText('Los pedidos están pausados')).toBeVisible()

  await context.close()
})

test('cocina: una cuenta sin rol activo no entra', async ({ page }) => {
  const backend = await openShop(page)
  backend.staff.active = false
  await staffLogin(page, backend)
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso' })).toBeVisible()
})
