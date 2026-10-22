// Playwright adapter for the in-memory backend (src/demo/backend.ts): wires the routes of a page to it.
import type { Page, Route, WebSocketRoute } from '@playwright/test'
import { DemoBackend } from '../../../src/demo/backend.ts'

export { CLOSED_AT, OPEN_AT, SITE, type Rows } from '../../../src/demo/backend.ts'

export class MockBackend extends DemoBackend {
  async install(page: Page): Promise<void> {
    await page.route(/\.supabase\.co\/rest\/v1\//, (route: Route) =>
      this.rest(route, this.corsHeaders(route)),
    )
    await page.route(/\.supabase\.co\/auth\/v1\//, (route: Route) =>
      this.auth(route, this.corsHeaders(route)),
    )
    await page.route(/\.supabase\.co\/functions\/v1\//, (route: Route) => this.functionRoute(route))

    // Product photos are remote and irrelevant to behaviour: serve a 1×1 transparent PNG instantly.
    await page.route(/res\.cloudinary\.com/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
          'base64',
        ),
      }),
    )
    await page.route(/mp\.test/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Mercado Pago (simulado)</title><h1>Pagá tu pedido</h1>',
      }),
    )
    await page.routeWebSocket(/realtime\/v1\/websocket/, (ws: WebSocketRoute) => {
      this.attachSocket({
        send: (data) => {
          ws.send(data)
        },
        onMessage: (handler) => {
          ws.onMessage((m) => {
            handler(String(m))
          })
        },
        onClose: (handler) => {
          ws.onClose(() => {
            handler()
          })
        },
      })
    })
  }
}
