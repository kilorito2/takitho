import { expect, test } from '@playwright/test'
import { chooseCard, fillContact, next, openCart } from './support/helpers.ts'

// The portfolio build has no server: one tab must be able to order, cook and administer.
test('demo: pedido de punta a punta sin backend, cocina y admin en la misma pestaña', async ({ page }) => {
  await page.goto('/menu')
  await expect(page.getByText('Demo de portafolio')).toBeVisible()
  await page.getByRole('button', { name: 'Elegir Tacos al pastor con piña' }).click()
  await page
    .getByRole('dialog', { name: 'Tacos al pastor con piña' })
    .getByRole('button', { name: /^Sumar · / })
    .click()
  const drawer = await openCart(page)
  await drawer.getByRole('link', { name: /^Pedir · / }).click()
  await next(page)
  await next(page)
  await fillContact(page)
  await next(page)
  await chooseCard(page, 'Pagás al recibir o retirar.')
  await next(page)
  await page.getByRole('button', { name: /^Confirmar pedido/ }).click()
  await expect(page.getByTestId('order-code')).toHaveText('TK-0001')

  // Same tab → kitchen (client-side navigation keeps the in-memory backend).
  await page
    .getByRole('navigation', { name: 'Pantallas de la demo' })
    .getByRole('link', { name: 'Cocina' })
    .click()
  await page.getByLabel('Email').fill('demo@takitho.test')
  await page.getByLabel('Contraseña').fill('demo1234')
  await page.getByRole('button', { name: 'Entrar' }).click()
  const card = page.getByTestId('kitchen-card')
  await expect(card).toContainText('TK-0001')
  await card.getByRole('button', { name: 'Empezar a preparar' }).click()
  await expect(page.getByTestId('column-preparing').getByTestId('kitchen-card')).toHaveCount(1)

  await page
    .getByRole('navigation', { name: 'Pantallas de la demo' })
    .getByRole('link', { name: 'Admin' })
    .click()
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible()
})
