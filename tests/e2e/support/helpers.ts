import { expect, type Page } from '@playwright/test'
import { MockBackend, OPEN_AT } from './backend.ts'

/** A mock backend with the shop open (Tuesday 21:00 Buenos Aires), installed on the page with a matching clock. */
export async function openShop(page: Page, backend = new MockBackend()): Promise<MockBackend> {
  backend.now = OPEN_AT
  await page.clock.install({ time: backend.now })
  await backend.install(page)
  return backend
}

/** Adds a product with no options straight from its card. */
export async function quickAdd(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Sumar ${name} a la comanda` }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Sumado a la comanda' }).first()).toBeVisible()
}

/** Opens "Tu comanda" and returns the drawer. Dialogs are found by name: another sheet may still be closing. */
export async function openCart(page: Page) {
  await page.getByRole('button', { name: /^Tu bandeja/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Tu comanda' })
  await expect(drawer).toBeVisible()
  return drawer
}

/** Fills the customer step. */
export async function fillContact(page: Page, name = 'Ana Pérez', phone = '11 1234-5678'): Promise<void> {
  await page.getByLabel('Nombre').fill(name)
  await page.getByLabel('WhatsApp').fill(phone)
}

export const next = (page: Page) => page.getByRole('button', { name: 'Siguiente' }).click()

/** Picks a radio card the way a person does: by clicking its visible label (the input itself is visually hidden). */
export const chooseCard = (page: Page, title: string | RegExp) =>
  page.locator('label').filter({ hasText: title }).first().click()

/** Signs in on the staff login page with the mock account. */
export async function staffLogin(page: Page, backend: MockBackend, next = '/cocina'): Promise<void> {
  await page.goto(`/staff/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Email').fill(backend.staff.email)
  await page.getByLabel('Contraseña').fill(backend.staff.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

/** A customer orders one product for pickup, paying cash, and lands on the tracking page. */
export async function orderCashPickup(
  page: Page,
  product = 'Tacos al pastor con piña',
  note = '',
): Promise<void> {
  await page.goto('/menu')
  await page.getByRole('button', { name: `Elegir ${product}` }).click()
  const sheet = page.getByRole('dialog', { name: product })
  if (note) await sheet.getByLabel('¿Alguna aclaración?').fill(note)
  await sheet.getByRole('button', { name: /^Sumar · / }).click()
  const drawer = await openCart(page)
  await drawer.getByRole('link', { name: /^Pedir · / }).click()
  await next(page) // pickup is the default
  await next(page) // as soon as possible
  await fillContact(page)
  await next(page)
  await chooseCard(page, 'Pagás al recibir o retirar.')
  await next(page)
  await page.getByRole('button', { name: /^Confirmar pedido/ }).click()
  await expect(page.getByTestId('order-code')).toBeVisible()
}
