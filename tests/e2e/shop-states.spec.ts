import { expect, test } from '@playwright/test'
import { MockBackend, CLOSED_AT } from './support/backend.ts'
import { openCart, openShop, quickAdd } from './support/helpers.ts'

test.describe('estados del local', () => {
  test('cerrado: avisa cuándo abre y ofrece programar', async ({ page }) => {
    const backend = new MockBackend()
    backend.now = CLOSED_AT
    await page.clock.install({ time: backend.now })
    await backend.install(page)
    await page.goto('/')
    const banner = page.getByRole('status').filter({ hasText: 'Estamos cerrados' }).first()
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('prendemos el comal a las 19')
    await expect(banner).toContainText('programar')
  })

  test('pausa manual: avisa y no inventa un horario', async ({ page }) => {
    const backend = await openShop(page)
    backend.setPaused(true)
    await page.goto('/menu')
    await expect(page.getByRole('status').filter({ hasText: 'pausamos los pedidos' }).first()).toBeVisible()
  })

  test('un producto se agota y la carta lo refleja sin recargar', async ({ page }) => {
    const backend = await openShop(page)
    await page.goto('/menu')
    await expect(page.getByRole('button', { name: 'Elegir Flan' })).toBeVisible()
    backend.setProductAvailable('Flan', false)
    await expect(page.getByRole('button', { name: 'Flan, agotado' })).toBeDisabled()
    backend.setProductAvailable('Flan', true)
    await expect(page.getByRole('button', { name: 'Elegir Flan' })).toBeEnabled()
  })

  test('cambia un precio con la comanda armada: se avisa y el total se actualiza', async ({ page }) => {
    const backend = await openShop(page)
    await page.goto('/menu')
    await quickAdd(page, 'Guacamole con totopos')
    backend.setPrice('Guacamole con totopos', 7400)
    const drawer = await openCart(page)
    await expect(drawer.getByRole('alert')).toContainText('Cambió algo')
    await expect(drawer.getByText(/Guacamole con totopos subió de precio/)).toBeVisible()
  })
})
