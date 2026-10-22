import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  chooseCard,
  fillContact,
  next,
  openCart,
  openShop,
  orderCashPickup,
  quickAdd,
  staffLogin,
} from './support/helpers.ts'

// /_kit only exists in dev builds. Every other screen is scanned inside the flow below, in both themes.
const STATIC_ROUTES = ['/', '/menu', '/mis-pedidos', '/_kit', '/ruta-que-no-existe']
const THEMES = ['light', 'dark'] as const

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => {
    localStorage.setItem('takitho-theme', t)
  }, theme)
}

/** WCAG 2.1 A/AA scan; one-off entrance animations are given time to settle so contrast is measured on final colours. */
async function scan(page: Page, where: string) {
  await page.waitForTimeout(700)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const summary = results.violations.map(
    (v) => `${where} → ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  )
  expect(summary, summary.join('\n')).toEqual([])
}

for (const theme of THEMES) {
  for (const route of STATIC_ROUTES) {
    test(`axe: ${route} (${theme})`, async ({ page }) => {
      await openShop(page)
      await setTheme(page, theme)
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await scan(page, route)
    })
  }

  test(`axe: pedido completo — hoja de producto, comanda, checkout y seguimiento (${theme})`, async ({
    page,
  }) => {
    await openShop(page)
    await setTheme(page, theme)
    await page.goto('/menu')

    await page.getByRole('button', { name: 'Elegir Tacos al pastor con piña' }).click()
    await expect(page.getByRole('dialog', { name: 'Tacos al pastor con piña' })).toBeVisible()
    await scan(page, 'hoja de producto')
    await page
      .getByRole('dialog', { name: 'Tacos al pastor con piña' })
      .getByRole('button', { name: /^Sumar · / })
      .click()
    await quickAdd(page, 'Guacamole con totopos')

    const drawer = await openCart(page)
    await scan(page, 'comanda')
    await drawer.getByRole('link', { name: /^Pedir · / }).click()

    await expect(page.getByRole('heading', { name: 'Tu pedido' })).toBeVisible()
    await scan(page, 'checkout · cómo')
    await chooseCard(page, 'Te lo llevamos hasta tu casa.')
    await scan(page, 'checkout · delivery')
    await chooseCard(page, 'Pasás a buscarlo')
    await next(page)
    await scan(page, 'checkout · cuándo')
    await next(page)
    await fillContact(page)
    await scan(page, 'checkout · datos')
    await next(page)
    await chooseCard(page, 'Pagás al recibir o retirar.')
    await scan(page, 'checkout · pago')
    await next(page)
    await scan(page, 'checkout · confirmar')
    await page.getByRole('button', { name: /^Confirmar pedido/ }).click()

    await expect(page.getByTestId('order-code')).toBeVisible()
    await scan(page, 'seguimiento')
  })
}

test('axe: login del personal, tablero de cocina y panel de stock', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: { width: 1180, height: 820 },
  })
  const kitchen = await context.newPage()
  const customer = await context.newPage()
  const backend = await openShop(kitchen)
  await backend.install(customer)
  await customer.clock.install({ time: backend.now })

  await kitchen.goto('/staff/login')
  await scan(kitchen, 'login del personal')
  await staffLogin(kitchen, backend)
  await expect(kitchen.getByTestId('connection')).toHaveAttribute('data-state', 'online')

  // One order per column, with a note, and one that has waited long enough to be flagged late.
  await orderCashPickup(customer, 'Tacos al pastor con piña', 'sin cebolla')
  await orderCashPickup(customer, 'Guacamole con totopos')
  await orderCashPickup(customer, 'Esquites')
  backend.advance('TK-0002')
  backend.advance('TK-0003')
  backend.advance('TK-0003')
  await expect(kitchen.getByTestId('kitchen-card')).toHaveCount(3)
  await kitchen.clock.fastForward('25:00')
  await expect(kitchen.getByText('Atrasado').first()).toBeVisible()
  await scan(kitchen, 'cocina · tablero')

  await kitchen.getByRole('button', { name: /^Entregados/ }).click()
  await scan(kitchen, 'cocina · entregados abiertos')
  await kitchen.getByRole('button', { name: 'Agotar / Pausar' }).click()
  await expect(kitchen.getByRole('dialog', { name: 'Agotar y pausar' })).toBeVisible()
  await scan(kitchen, 'cocina · agotar y pausar')
  await context.close()
})

for (const theme of THEMES) {
  test(`axe: administración, todas las secciones (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
      viewport: { width: 1280, height: 860 },
    })
    const admin = await context.newPage()
    const customer = await context.newPage()
    const backend = await openShop(admin)
    backend.staff.role = 'admin'
    await backend.install(customer)
    await customer.clock.install({ time: backend.now })
    await setTheme(admin, theme)
    await orderCashPickup(customer, 'Tacos al pastor con piña', 'sin cebolla')

    await staffLogin(admin, backend, '/admin')
    await expect(admin.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible()
    await expect(admin.getByRole('heading', { name: 'Lo más pedido' })).toBeVisible()
    await scan(admin, 'admin · resumen')

    await admin.getByRole('link', { name: 'Pedidos' }).click()
    await expect(admin.getByRole('link', { name: 'TK-0001' })).toBeVisible()
    await scan(admin, 'admin · pedidos')
    await admin.getByRole('link', { name: 'TK-0001' }).click()
    await expect(admin.getByRole('heading', { name: 'TK-0001' })).toBeVisible()
    await scan(admin, 'admin · detalle de pedido')

    await admin.getByRole('link', { name: 'Menú' }).click()
    await expect(admin.getByRole('button', { name: 'Editar Tacos al pastor con piña' })).toBeVisible()
    await scan(admin, 'admin · menú · productos')
    await admin.getByRole('button', { name: 'Editar Tacos al pastor con piña' }).click()
    await expect(admin.getByRole('dialog', { name: 'Editar Tacos al pastor con piña' })).toBeVisible()
    await scan(admin, 'admin · formulario de producto')
    await admin.keyboard.press('Escape')
    await admin.getByRole('tab', { name: 'Categorías' }).click()
    await scan(admin, 'admin · menú · categorías')
    await admin.getByRole('tab', { name: 'Opciones' }).click()
    await scan(admin, 'admin · menú · opciones')

    await admin.getByRole('link', { name: 'Promos' }).click()
    await expect(admin.getByRole('heading', { name: 'Promos y cupones', level: 1 })).toBeVisible()
    await scan(admin, 'admin · promos')
    await admin.getByRole('button', { name: 'Nueva promo' }).click()
    await expect(admin.getByRole('dialog', { name: 'Nueva promo' })).toBeVisible()
    await scan(admin, 'admin · formulario de promo')
    await admin.keyboard.press('Escape')

    await admin.getByRole('link', { name: 'Local' }).click()
    await expect(admin.getByRole('heading', { name: 'Horarios' })).toBeVisible()
    await scan(admin, 'admin · local')

    await admin.getByRole('link', { name: 'Mesas' }).click()
    await expect(admin.getByRole('button', { name: 'Editar mesa 1' })).toBeVisible()
    await scan(admin, 'admin · mesas')

    await admin.getByRole('link', { name: 'Equipo' }).click()
    await expect(admin.getByText(backend.staff.email).first()).toBeVisible()
    await scan(admin, 'admin · equipo')
    await context.close()
  })
}
