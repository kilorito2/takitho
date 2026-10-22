// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hmacSha256Hex } from '../../supabase/functions/_shared/crypto.ts'
import {
  handleCreateMpPreference,
  handleMpWebhook,
} from '../../supabase/functions/_shared/handlers/payments.ts'
import { verifyWebhookSignature } from '../../supabase/functions/_shared/mp.ts'
import type { StoredOrder } from '../../supabase/functions/_shared/ports.ts'
import { bodyText, makeHarness, post, urlOf } from './testkit.ts'

const SECRET = 'whsec'
const NOW = new Date('2026-10-19T21:00:00-03:00')
const ts = Math.floor(NOW.getTime() / 1000)
const ORDER_ID = '77777777-7777-4777-8777-777777777777'

async function sign(
  dataId: string | null,
  requestId: string | null,
  at = ts,
  secret = SECRET,
): Promise<string> {
  const manifest = [dataId ? `id:${dataId}` : null, requestId ? `request-id:${requestId}` : null, `ts:${at}`]
    .filter(Boolean)
    .join(';')
  return `ts=${at},v1=${await hmacSha256Hex(secret, `${manifest};`)}`
}

describe('verifyWebhookSignature (manifest taken from the official SDK)', () => {
  const base = { dataId: '123456', xRequestId: 'req-1', secret: SECRET, nowMs: NOW.getTime() }

  it('accepts a correct signature', async () => {
    expect(await verifyWebhookSignature({ ...base, xSignature: await sign('123456', 'req-1') })).toBe('ok')
  })

  it('omits missing pairs from the manifest, like the SDK does', async () => {
    expect(
      await verifyWebhookSignature({ ...base, dataId: null, xSignature: await sign(null, 'req-1') }),
    ).toBe('ok')
    expect(
      await verifyWebhookSignature({ ...base, xRequestId: null, xSignature: await sign('123456', null) }),
    ).toBe('ok')
  })

  it('rejects a wrong secret, a tampered id and a tampered request id', async () => {
    expect(
      await verifyWebhookSignature({
        ...base,
        xSignature: await sign('123456', 'req-1', ts, 'otro-secreto'),
      }),
    ).toBe('mismatch')
    expect(
      await verifyWebhookSignature({ ...base, dataId: '999', xSignature: await sign('123456', 'req-1') }),
    ).toBe('mismatch')
    expect(
      await verifyWebhookSignature({
        ...base,
        xRequestId: 'req-2',
        xSignature: await sign('123456', 'req-1'),
      }),
    ).toBe('mismatch')
  })

  it('rejects missing and malformed headers', async () => {
    expect(await verifyWebhookSignature({ ...base, xSignature: null })).toBe('missing')
    expect(await verifyWebhookSignature({ ...base, xSignature: '   ' })).toBe('missing')
    for (const header of ['garbage', 'ts=abc,v1=ff', 'v1=ff', `ts=${ts}`, 'ts=,v1=']) {
      expect(await verifyWebhookSignature({ ...base, xSignature: header })).toBe('malformed')
    }
  })

  it('rejects replays outside the tolerance window', async () => {
    const old = ts - 3600
    expect(await verifyWebhookSignature({ ...base, xSignature: await sign('123456', 'req-1', old) })).toBe(
      'stale',
    )
    expect(
      await verifyWebhookSignature({ ...base, xSignature: await sign('123456', 'req-1', ts - 120) }),
    ).toBe('ok')
  })
})

type FetchLog = { url: string; init?: RequestInit | undefined }[]
const mpFetch =
  (payment: unknown, log: FetchLog = [], status = 200): typeof fetch =>
  (input, init) => {
    log.push({ url: urlOf(input), init })
    return Promise.resolve(new Response(JSON.stringify(payment), { status }))
  }

const webhook = async (opts: {
  query?: string
  headers?: Record<string, string>
  body?: unknown
  dataId?: string | null
  requestId?: string | null
}) => {
  const dataId = opts.dataId === undefined ? '555' : opts.dataId
  const requestId = opts.requestId === undefined ? 'req-9' : opts.requestId
  const query = opts.query ?? `?data.id=${dataId ?? ''}&type=payment`
  return post(
    opts.body ?? { type: 'payment', data: { id: '555' } },
    {
      'x-signature': await sign(dataId, requestId),
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...opts.headers,
    },
    `https://proj.supabase.co/functions/v1/mp-webhook${query}`,
  )
}

const approved = {
  id: 555,
  status: 'approved',
  external_reference: ORDER_ID,
  transaction_amount: 17700,
  currency_id: 'ARS',
  extra: 'ignored',
}

describe('mp-webhook (ADR-0007)', () => {
  it('verifies the signature, asks Mercado Pago for the payment and applies THAT result', async () => {
    const log: FetchLog = []
    const h = makeHarness({ now: NOW, fetch: mpFetch(approved, log) })
    // The body claims something else entirely: it must be ignored.
    const res = await handleMpWebhook(
      await webhook({ body: { type: 'payment', data: { id: '555' }, status: 'rejected', amount: 1 } }),
      h.deps,
    )
    expect(res.status).toBe(200)
    expect(log).toHaveLength(1)
    expect(log[0]?.url).toBe('https://api.mercadopago.test/v1/payments/555')
    expect((log[0]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer TEST-token')
    expect(h.state.applied).toEqual([
      {
        orderId: ORDER_ID,
        mpPaymentId: '555',
        mpStatus: 'approved',
        amount: 17700,
        currency: 'ARS',
        raw: { id: 555, status: 'approved', amount: 17700, currency: 'ARS' },
      },
    ])
  })

  it('answers 401 and touches nothing when the signature is wrong or missing', async () => {
    const log: FetchLog = []
    const h = makeHarness({ now: NOW, fetch: mpFetch(approved, log) })
    const forged = await webhook({ headers: { 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}` } })
    await expect(handleMpWebhook(forged, h.deps)).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE',
      status: 401,
    })
    const unsigned = post(
      { type: 'payment' },
      {},
      'https://proj.supabase.co/functions/v1/mp-webhook?data.id=555&type=payment',
    )
    await expect(handleMpWebhook(unsigned, h.deps)).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' })
    expect(log).toHaveLength(0)
    expect(h.state.applied).toHaveLength(0)
    expect(h.logs.length).toBeGreaterThan(0)
  })

  it('does not trust the back_url: a request with status=approved in the query changes nothing', async () => {
    const h = makeHarness({ now: NOW, fetch: mpFetch({ ...approved, status: 'rejected' }) })
    const res = await handleMpWebhook(
      await webhook({ query: '?data.id=555&type=payment&status=approved&collection_status=approved' }),
      h.deps,
    )
    expect(res.status).toBe(200)
    expect(h.state.applied[0]?.mpStatus).toBe('rejected')
  })

  it('ignores other topics, non-numeric ids and payments that are not ours', async () => {
    const log: FetchLog = []
    const h = makeHarness({ now: NOW, fetch: mpFetch(approved, log) })
    expect(
      await (
        await handleMpWebhook(await webhook({ query: '?data.id=555&type=merchant_order' }), h.deps)
      ).json(),
    ).toEqual({ ignored: true })
    expect(
      await (
        await handleMpWebhook(await webhook({ dataId: 'abc', query: '?data.id=abc&type=payment' }), h.deps)
      ).json(),
    ).toEqual({ ignored: true })
    expect(log).toHaveLength(0)
    const stranger = makeHarness({
      now: NOW,
      fetch: mpFetch({ ...approved, external_reference: 'not-a-uuid' }),
    })
    expect(await (await handleMpWebhook(await webhook({}), stranger.deps)).json()).toEqual({ ignored: true })
    expect(stranger.state.applied).toHaveLength(0)
  })

  it('answers 5xx (so Mercado Pago retries) when it cannot reach the payments API', async () => {
    const down = makeHarness({ now: NOW, fetch: mpFetch({}, [], 503) })
    await expect(handleMpWebhook(await webhook({}), down.deps)).rejects.toMatchObject({
      code: 'MP_UNAVAILABLE',
      status: 502,
    })
    const garbage = makeHarness({ now: NOW, fetch: mpFetch({ unexpected: true }) })
    await expect(handleMpWebhook(await webhook({}), garbage.deps)).rejects.toMatchObject({
      code: 'MP_UNAVAILABLE',
    })
  })

  it('is not available when Mercado Pago is not configured', async () => {
    const h = makeHarness({ now: NOW, config: { mp: null } })
    await expect(handleMpWebhook(await webhook({}), h.deps)).rejects.toMatchObject({ code: 'MP_UNAVAILABLE' })
  })
})

describe('create-mp-preference', () => {
  const token = 'c'.repeat(64)
  const pending = (over: Partial<StoredOrder> = {}): StoredOrder => ({
    id: ORDER_ID,
    code: 'TK-0427',
    status: 'pending_payment',
    type: 'pickup',
    paymentMethod: 'mercado_pago',
    paymentStatus: 'pending',
    subtotal: 16200,
    discount: 0,
    deliveryFee: 1500,
    tip: 0,
    total: 17700,
    createdAt: NOW.toISOString(),
    scheduledFor: null,
    estimatedMinutes: 25,
    tableNumber: null,
    mpPreferenceId: null,
    items: [],
    history: [],
    ...over,
  })
  const prefResponse = {
    id: 'pref-1',
    init_point: 'https://www.mercadopago.test/checkout/v1/redirect?pref_id=pref-1',
    sandbox_init_point: 'https://sandbox.mercadopago.test/checkout/v1/redirect?pref_id=pref-1',
  }

  it('builds a one-line preference for the exact order total and returns the checkout URL', async () => {
    const log: FetchLog = []
    const h = makeHarness({
      now: NOW,
      fetch: mpFetch(prefResponse, log),
      config: {
        mp: {
          accessToken: 'TEST-token',
          webhookSecret: SECRET,
          env: 'production',
          apiBase: 'https://api.mercadopago.com',
        },
      },
    })
    h.state.storedByToken.set(token, pending())
    const res = await handleCreateMpPreference(post({ order_code: 'tk-0427', public_token: token }), h.deps)
    expect(await res.json()).toEqual({ init_point: prefResponse.init_point, preference_id: 'pref-1' })
    expect(log[0]?.url).toBe('https://api.mercadopago.com/checkout/preferences')
    const sent = JSON.parse(bodyText(log[0]?.init)) as Record<string, unknown>
    expect(sent).toMatchObject({
      items: [{ id: 'TK-0427', quantity: 1, unit_price: 17700, currency_id: 'ARS' }],
      external_reference: ORDER_ID,
      notification_url: 'https://proj.supabase.co/functions/v1/mp-webhook',
      back_urls: { success: `https://takitho.test/pedido/TK-0427?t=${token}` },
      auto_return: 'approved',
      binary_mode: true,
      expires: true,
    })
    expect(h.state.preferenceIds.get(ORDER_ID)).toBe('pref-1')
  })

  it('uses the sandbox checkout URL when running in sandbox mode', async () => {
    const h = makeHarness({ now: NOW, fetch: mpFetch(prefResponse) })
    h.state.storedByToken.set(token, pending())
    const data = (await (
      await handleCreateMpPreference(post({ order_code: 'TK-0427', public_token: token }), h.deps)
    ).json()) as { init_point: string }
    expect(data.init_point).toBe(prefResponse.sandbox_init_point)
  })

  it('expires the preference together with the unpaid order', async () => {
    const log: FetchLog = []
    const h = makeHarness({ now: NOW, fetch: mpFetch(prefResponse, log) })
    h.state.storedByToken.set(token, pending())
    await handleCreateMpPreference(post({ order_code: 'TK-0427', public_token: token }), h.deps)
    const sent = JSON.parse(bodyText(log[0]?.init)) as {
      expiration_date_from: string
      expiration_date_to: string
    }
    expect(Date.parse(sent.expiration_date_to) - Date.parse(sent.expiration_date_from)).toBe(30 * 60_000)
  })

  it.each([
    ['cash order', pending({ paymentMethod: 'cash' })],
    ['already paid', pending({ paymentStatus: 'paid' })],
    ['already received', pending({ status: 'received' })],
    ['cancelled', pending({ status: 'cancelled' })],
  ])('refuses to charge a %s', async (_name, order) => {
    const h = makeHarness({ now: NOW, fetch: mpFetch(prefResponse) })
    h.state.storedByToken.set(token, order)
    await expect(
      handleCreateMpPreference(post({ order_code: 'TK-0427', public_token: token }), h.deps),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_PAYABLE', status: 409 })
  })

  it('returns the same 404 for a wrong code and a wrong token', async () => {
    const h = makeHarness({ now: NOW, fetch: mpFetch(prefResponse) })
    h.state.storedByToken.set(token, pending())
    await expect(
      handleCreateMpPreference(post({ order_code: 'TK-0001', public_token: token }), h.deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      handleCreateMpPreference(post({ order_code: 'TK-0427', public_token: 'd'.repeat(64) }), h.deps),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('reports Mercado Pago outages as 502 without leaking details', async () => {
    const h = makeHarness({
      now: NOW,
      fetch: mpFetch({ message: 'invalid access token TEST-secret' }, [], 401),
    })
    h.state.storedByToken.set(token, pending())
    const error = await handleCreateMpPreference(
      post({ order_code: 'TK-0427', public_token: token }),
      h.deps,
    ).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'MP_UNAVAILABLE', status: 502 })
    expect(JSON.stringify(error)).not.toContain('TEST-secret')
  })
})
