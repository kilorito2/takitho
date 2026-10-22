// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api'

const config = (fetchImpl: typeof fetch) => ({
  functionsUrl: 'https://p.supabase.co/functions/v1',
  publishableKey: 'sb_publishable_test_key_1234',
  fetch: fetchImpl,
})
const respond = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })))

describe('api client', () => {
  it('POSTs JSON with the publishable key and returns the parsed body', async () => {
    const fetchMock = respond(200, { total: 100 })
    const result = await createApiClient(config(fetchMock)).call<{ total: number }>('quote-order', { a: 1 })
    expect(result).toEqual({ total: 100 })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://p.supabase.co/functions/v1/quote-order')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({ a: 1 })
    expect(init?.headers).toMatchObject({
      apikey: 'sb_publishable_test_key_1234',
      'Content-Type': 'application/json',
    })
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('sends the staff access token when given', async () => {
    const fetchMock = respond(200, {})
    await createApiClient(config(fetchMock)).call('invite-staff', {}, { accessToken: 'jwt' })
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer jwt')
  })

  it('turns the server error contract into ApiError', async () => {
    const fetchMock = respond(409, {
      error: {
        code: 'STORE_CLOSED',
        message: 'Estamos cerrados, prendemos el comal a las 19 h.',
        details: { next_open_at: 'x' },
      },
    })
    const error = await createApiClient(config(fetchMock))
      .call('create-order', {})
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'STORE_CLOSED',
      status: 409,
      message: 'Estamos cerrados, prendemos el comal a las 19 h.',
      details: { next_open_at: 'x' },
    })
  })

  it('exposes retry-after for rate limits', async () => {
    const error = await createApiClient(
      config(respond(429, { error: { code: 'RATE_LIMITED', message: 'x', details: { retry_after_s: 42 } } })),
    )
      .call('create-order', {})
      .catch((e: unknown) => e)
    expect((error as ApiError).retryAfterSeconds).toBe(42)
    expect(new ApiError('INTERNAL', 'x', 500).retryAfterSeconds).toBeNull()
  })

  it('maps an unreadable error body by status and network failures to NETWORK', async () => {
    const html = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 })),
    )
    await expect(createApiClient(config(html)).call('x', {})).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 502,
    })
    const client = vi.fn<typeof fetch>(() => Promise.resolve(new Response('nope', { status: 400 })))
    await expect(createApiClient(config(client)).call('x', {})).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(createApiClient(config(offline)).call('x', {})).rejects.toMatchObject({
      code: 'NETWORK',
      status: 0,
    })
  })

  it('lets aborts through untouched so callers can cancel', async () => {
    const aborted = vi.fn<typeof fetch>(() => Promise.reject(new DOMException('aborted', 'AbortError')))
    await expect(createApiClient(config(aborted)).call('x', {})).rejects.toMatchObject({ name: 'AbortError' })
  })
})
