import { expect, test } from '@playwright/test'
import { chooseCard, fillContact, next, openCart, openShop, quickAdd } from './support/helpers.ts'

// Acceptance: "pedido de delivery pagado con Mercado Pago" (SPEC §12 A3). The payment is confirmed ONLY by the webhook:
// coming back from Mercado Pago (back_url) must not mark anything as paid (ADR-0014).
test('delivery con Mercado Pago: se confirma recién cuando llega el webhook', async ({ page }) => {
  const backend = await openShop(page)
  await page.goto('/menu')
  await quickAdd(page, 'Guacamole con totopos')
  await quickAdd(page, 'Esquites')

  const drawer = await openCart(page)
  await drawer.getByRole('link', { name: /^Pedir · / }).click()

  // Step 1 — delivery needs a zone and an address
  await chooseCard(page, 'Te lo llevamos hasta tu casa.')
  await page.getByLabel('Zona de entrega').selectOption({ index: 1 })
  await page.getByLabel('Calle').fill('Av. Siempreviva')
  await page.getByLabel('Altura').fill('742')
  await next(page)
  await next(page) // when: as soon as possible
  await fillContact(page)
  await next(page)
  await chooseCard(page, 'Tarjeta, dinero en cuenta')
  await next(page)

  // Confirm: the delivery fee shows up in the ticket and the server computes the total.
  await expect(page.getByText(/^Envío/)).toBeVisible()
  await page.getByRole('button', { name: /^Confirmar pedido/ }).click()

  // The customer is sent to Mercado Pago (simulated page).
  await expect(page).toHaveURL(/mp\.test/)
  const stored = backend.state.orders[0]?.payload
  expect(stored?.payment).toMatchObject({ method: 'mercado_pago' })
  expect(stored?.totals.delivery_fee).toBeGreaterThan(0)

  // Back on the tracking page the order is still waiting: returning from MP proves nothing.
  const [token, order] = [...backend.state.storedByToken.entries()][0] ?? []
  expect(order?.status).toBe('pending_payment')
  await page.goto(`/pedido/${order?.code}?t=${token}`)
  await expect(page.getByText('Tu pedido espera el pago.').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeVisible()

  // The signed webhook arrives: the page flips to "received" without a reload.
  await backend.approvePayment(order?.code ?? '')
  await expect(page.getByText('¡Sale! Recibimos tu pedido').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeHidden()
})
