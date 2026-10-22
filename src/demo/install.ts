// Demo mode (VITE_DEMO=true): the whole app runs in the browser with no Supabase, Mercado Pago or Cloudinary account.
// The REAL Edge Function handlers and the real seed run over an in-memory backend; `fetch` and `WebSocket` are
// intercepted for the fake Supabase host, so every screen (customer, kitchen, admin) works as in production.
// State lives in the tab: reloading resets it. Used for the portfolio build.
import { defaultSettings } from '../../tests/functions/testkit.ts'
import { DemoBackend, type BackendRoute } from './backend.ts'

import { DEMO_LOGIN } from './credentials.ts'

function routeFor(request: Request, body: string): { route: BackendRoute; result: Promise<Response> } {
  let resolve!: (r: Response) => void
  const result = new Promise<Response>((r) => {
    resolve = r
  })
  const headers: Record<string, string> = {}
  request.headers.forEach((v, k) => (headers[k] = v))
  const route: BackendRoute = {
    request: () => ({
      method: () => request.method,
      url: () => request.url,
      headers: () => headers,
      postData: () => (body === '' ? null : body),
    }),
    fulfill: ({ status, headers: h = {}, json, body: raw }) => {
      const responseHeaders = new Headers(h)
      let text: string | null = raw ?? null
      if (json !== undefined) {
        text = JSON.stringify(json)
        responseHeaders.set('content-type', 'application/json')
      }
      resolve(new Response(status === 204 ? null : text, { status, headers: responseHeaders }))
    },
  }
  return { route, result }
}

/** Phoenix-speaking WebSocket stand-in wired to the backend (used only for the fake Realtime URL). */
function fakeWebSocketClass(backend: DemoBackend, RealWebSocket: typeof WebSocket): typeof WebSocket {
  class FakeWebSocket extends EventTarget {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSING = 2
    readonly CLOSED = 3
    readyState = 0
    binaryType = 'blob'
    onopen: ((e: Event) => void) | null = null
    onmessage: ((e: MessageEvent) => void) | null = null
    onclose: ((e: CloseEvent) => void) | null = null
    onerror: ((e: Event) => void) | null = null
    private incoming: ((m: string) => void)[] = []
    private closing: (() => void)[] = []

    readonly url: string

    constructor(url: string) {
      super()
      this.url = url
      backend.attachSocket({
        send: (data) => {
          queueMicrotask(() => {
            const event = new MessageEvent('message', { data })
            this.onmessage?.(event)
            this.dispatchEvent(event)
          })
        },
        onMessage: (h) => this.incoming.push(h),
        onClose: (h) => this.closing.push(h),
      })
      setTimeout(() => {
        this.readyState = 1
        const event = new Event('open')
        this.onopen?.(event)
        this.dispatchEvent(event)
      }, 0)
    }

    send(data: string): void {
      for (const h of this.incoming) h(data)
    }

    close(code = 1000): void {
      if (this.readyState === 3) return
      this.readyState = 3
      for (const h of this.closing) h()
      const event = new CloseEvent('close', { code })
      this.onclose?.(event)
      this.dispatchEvent(event)
    }
  }

  // Anything that is not the fake Realtime endpoint keeps using the real WebSocket.
  const Wrapper = function (url: string | URL, protocols?: string | string[]) {
    return String(url).includes('/realtime/v1/websocket')
      ? new FakeWebSocket(String(url))
      : new RealWebSocket(url, protocols)
  } as unknown as typeof WebSocket
  return Wrapper
}

export function installDemo(): DemoBackend {
  const allDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: '00:00', closesAt: '23:59' }))
  const backend = new DemoBackend({
    shifts: allDay,
    // No Mercado Pago in the demo: it needs real credentials. Cash and transfer cover the whole flow.
    settings: { ...defaultSettings(), payMpEnabled: false },
  })
  backend.rows.opening_hours.splice(
    0,
    backend.rows.opening_hours.length,
    ...allDay.map((s) => ({ weekday: s.weekday, opens_at: '00:00:00', closes_at: '23:59:00' })),
  )
  Object.defineProperty(backend, 'now', { get: () => new Date() })
  backend.staff.role = 'admin'
  backend.staff.email = DEMO_LOGIN.email
  backend.staff.password = DEMO_LOGIN.password
  backend.staff.name = 'Demo'

  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (!url.hostname.endsWith('.supabase.co')) return realFetch(input, init)
    const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text()
    const { route, result } = routeFor(request, body)
    if (url.pathname.startsWith('/rest/v1/')) void backend.rest(route, backend.corsHeaders(route))
    else if (url.pathname.startsWith('/auth/v1/')) void backend.auth(route, backend.corsHeaders(route))
    else if (url.pathname.startsWith('/functions/v1/')) void backend.functionRoute(route)
    else return realFetch(input, init)
    return result
  }
  window.WebSocket = fakeWebSocketClass(backend, window.WebSocket)
  return backend
}
