// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../supabase/functions/_shared/config.ts'
import { sha256Hex, stableStringify, timingSafeEqual } from '../../supabase/functions/_shared/crypto.ts'
import { handleCloudinarySign, handleInviteStaff } from '../../supabase/functions/_shared/handlers/staff.ts'
import { sanitizeText } from '../../supabase/functions/_shared/sanitize.ts'
import { makeHarness, post } from './testkit.ts'

const auth = (jwt: string) => ({ authorization: `Bearer ${jwt}` })

function harness() {
  const h = makeHarness({ now: new Date('2026-10-19T21:00:00-03:00') })
  h.state.staff.set('admin-jwt', { userId: 'u-admin', role: 'admin' })
  h.state.staff.set('kitchen-jwt', { userId: 'u-kitchen', role: 'kitchen' })
  return h
}

describe('staff functions: authentication and authorization', () => {
  it.each([
    ['cloudinary-sign', handleCloudinarySign, { kind: 'menu' }],
    ['invite-staff', handleInviteStaff, { email: 'nueva@takitho.test', role: 'kitchen' }],
  ] as const)('%s requires a valid session and the admin role', async (_name, handler, payload) => {
    const h = harness()
    await expect(handler(post(payload), h.deps)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    await expect(handler(post(payload, auth('forged-jwt')), h.deps)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    await expect(handler(post(payload, auth('kitchen-jwt')), h.deps)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
    expect((await handler(post(payload, auth('admin-jwt')), h.deps)).status).toBe(200)
  })
})

describe('cloudinary-sign (ADR-0009)', () => {
  it('returns a signature Cloudinary will accept, without leaking the API secret', async () => {
    const h = harness()
    const res = await handleCloudinarySign(
      post({ kind: 'menu', slug: 'taco-al-pastor' }, auth('admin-jwt')),
      h.deps,
    )
    const data = (await res.json()) as {
      cloud_name: string
      api_key: string
      timestamp: number
      signature: string
      public_id: string
      params: Record<string, string>
    }
    expect(data).toMatchObject({
      cloud_name: 'demo',
      api_key: '123456',
      public_id: 'takitho/menu/taco-al-pastor',
    })
    const expectedString = `asset_folder=takitho/menu&invalidate=true&overwrite=true&public_id=takitho/menu/taco-al-pastor&timestamp=${data.timestamp}shhh`
    expect(data.signature).toBe(createHash('sha1').update(expectedString).digest('hex'))
    expect(JSON.stringify(data)).not.toContain('shhh')
    expect(data.timestamp).toBe(Math.floor(new Date('2026-10-19T21:00:00-03:00').getTime() / 1000))
  })

  it('generates a public_id when none is given and rejects path-like slugs', async () => {
    const h = harness()
    const ok = (await (
      await handleCloudinarySign(post({ kind: 'menu' }, auth('admin-jwt')), h.deps)
    ).json()) as { public_id: string }
    expect(ok.public_id).toMatch(/^takitho\/menu\/p-[0-9a-f]{8}$/)
    await expect(
      handleCloudinarySign(post({ kind: 'menu', slug: '../../etc/passwd' }, auth('admin-jwt')), h.deps),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('fails clearly when Cloudinary is not configured', async () => {
    const h = makeHarness({ config: { cloudinary: null } })
    h.state.staff.set('admin-jwt', { userId: 'u', role: 'admin' })
    await expect(
      handleCloudinarySign(post({ kind: 'menu' }, auth('admin-jwt')), h.deps),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})

describe('invite-staff', () => {
  it('invites with the chosen role and normalises the email', async () => {
    const h = harness()
    const res = await handleInviteStaff(
      post({ email: 'Cocina@Takitho.TEST', role: 'kitchen', full_name: 'Cocina noche' }, auth('admin-jwt')),
      h.deps,
    )
    expect(await res.json()).toEqual({ user_id: 'user-new', email: 'cocina@takitho.test', role: 'kitchen' })
    expect(h.state.invites).toEqual([{ email: 'cocina@takitho.test', role: 'kitchen' }])
  })

  it.each([
    { email: 'no-es-un-mail', role: 'kitchen' },
    { email: 'a@b.test', role: 'superadmin' },
    { role: 'admin' },
  ])('rejects invalid payload %j', async (payload) => {
    await expect(handleInviteStaff(post(payload, auth('admin-jwt')), harness().deps)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })
})

describe('loadConfig', () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name]

  it('reads secrets and falls back to safe defaults', () => {
    const c = loadConfig(
      env({
        SUPABASE_URL: 'https://p.supabase.co/',
        SITE_URL: 'https://takitho.test/',
        ALLOWED_ORIGINS: 'https://takitho.test, https://www.takitho.test',
      }),
    )
    expect(c).toMatchObject({
      allowedOrigins: ['https://takitho.test', 'https://www.takitho.test'],
      siteUrl: 'https://takitho.test',
      functionsUrl: 'https://p.supabase.co/functions/v1',
      mp: null,
      cloudinary: null,
      turnstileSecret: null,
      limits: { createIp: 5, createPhone: 3, quoteIp: 60, getOrderIp: 120, windowSeconds: 600 },
    })
  })

  it('enables Mercado Pago only with both secrets and defaults to sandbox', () => {
    expect(loadConfig(env({ MP_ACCESS_TOKEN: 't' })).mp).toBeNull()
    expect(loadConfig(env({ MP_ACCESS_TOKEN: 't', MP_WEBHOOK_SECRET: 's' })).mp).toMatchObject({
      env: 'sandbox',
      apiBase: 'https://api.mercadopago.com',
    })
  })

  it('honours a custom MP API base only in sandbox (ADR-0014), never in production', () => {
    const sandbox = loadConfig(
      env({ MP_ACCESS_TOKEN: 't', MP_WEBHOOK_SECRET: 's', MP_API_BASE: 'http://localhost:9999/' }),
    )
    expect(sandbox.mp?.apiBase).toBe('http://localhost:9999')
    const prod = loadConfig(
      env({
        MP_ACCESS_TOKEN: 't',
        MP_WEBHOOK_SECRET: 's',
        MP_ENV: 'production',
        MP_API_BASE: 'http://localhost:9999',
      }),
    )
    expect(prod.mp).toMatchObject({ env: 'production', apiBase: 'https://api.mercadopago.com' })
  })

  it('ignores nonsense rate-limit overrides', () => {
    expect(loadConfig(env({ RATE_CREATE_IP: 'lots', RATE_QUOTE_IP: '-3' })).limits).toMatchObject({
      createIp: 5,
      quoteIp: 60,
    })
    expect(loadConfig(env({ RATE_CREATE_IP: '9' })).limits.createIp).toBe(9)
  })
})

describe('crypto and sanitising helpers', () => {
  it('sha256Hex matches the reference digest', async () => {
    expect(await sha256Hex('takitho')).toBe(createHash('sha256').update('takitho').digest('hex'))
  })

  it('stableStringify is independent of key order and drops undefined', () => {
    expect(stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe(
      stableStringify({ a: { c: undefined, d: [3, { x: 2, y: 1 }] }, b: 1 }),
    )
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}')
  })

  it('timingSafeEqual compares fixed-size digests', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })

  it('sanitizeText strips markup characters, control and zero-width characters and caps the length', () => {
    expect(sanitizeText('  sin <b>cebolla</b>\u0000​ porfa\n\n')).toBe('sin bcebolla/b porfa')
    expect(sanitizeText('x'.repeat(500)).length).toBe(140)
    expect(sanitizeText('abc', 2)).toBe('ab')
  })
})
