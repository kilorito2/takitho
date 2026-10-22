// Generates the Postman collection + environments for the Edge Functions (docs/API.md).
// Ids come from the deterministic seed, so the collection runs as-is against a seeded database.
// Usage: node scripts/gen-postman.mjs  → postman/*.json   (also pushed to the "Takitho" workspace through the Postman MCP)
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// seed ids (see scripts/seed-data.mjs): product 1 = Tacos al pastor; modifiers 1 = Maíz, 6 = "Con todo", 10 = Queso extra
const PASTOR = id('a', 1)
const HORCHATA = id('a', 17)
const MAIZ = id('d', 1)
const CON_TODO = id('d', 6)
const QUESO = id('d', 10)
const ZONE = id('e', 1)

const js = (...lines) => ({ listen: 'test', script: { type: 'text/javascript', exec: lines } })
const pre = (...lines) => ({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines } })

const json = (
  name,
  url,
  body,
  { headers = [], tests = [], prerequest = [], description = '', auth = null } = {},
) => ({
  name,
  event: [...(prerequest.length ? [pre(...prerequest)] : []), ...(tests.length ? [js(...tests)] : [])],
  request: {
    method: 'POST',
    ...(auth ? { auth } : {}),
    header: [...headers],
    url: { raw: `{{base_url}}/${url}`, host: ['{{base_url}}'], path: [url] },
    body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } },
    description,
  },
})

const staffAuth = { type: 'bearer', bearer: [{ key: 'token', value: '{{staff_jwt}}', type: 'string' }] }
const orderItems = [
  { product_id: PASTOR, quantity: 2, modifier_ids: [MAIZ, CON_TODO, QUESO], note: 'sin cebolla porfa' },
]

const check = (status, ...extra) => [
  `pm.test('status ${status}', () => pm.response.to.have.status(${status}))`,
  ...extra,
]

const collection = {
  info: {
    name: 'Takitho — Edge Functions',
    description:
      'Colección de las Edge Functions de Takitho (docs/API.md). Corré las carpetas en orden: "create-order" guarda el código y el token que usan "get-order" y "create-mp-preference".\n\nVariables: base_url, publishable_key, staff_jwt (admin), mp_webhook_secret. Los pedidos de prueba se crean en el proyecto al que apunte el environment.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  // Shared headers (Content-Type + publishable key) are added here instead of repeating them on every request.
  event: [
    pre(
      "if (!pm.request.headers.has('Content-Type')) pm.request.headers.add({ key: 'Content-Type', value: 'application/json' })",
      "if (!pm.request.headers.has('apikey')) pm.request.headers.add({ key: 'apikey', value: pm.environment.get('publishable_key') || '' })",
    ),
  ],
  variable: [
    { key: 'idempotency_key', value: '' },
    { key: 'order_code', value: '' },
    { key: 'order_token', value: '' },
  ],
  item: [
    {
      name: 'quote-order',
      item: [
        json(
          'Cotizar un pedido (totales del servidor)',
          'quote-order',
          { items: orderItems, type: 'pickup', schedule: { mode: 'asap' } },
          {
            tests: check(
              200,
              'const q = pm.response.json()',
              "pm.test('el total es la suma de las líneas', () => pm.expect(q.total).to.eql(q.subtotal - q.discount + q.delivery_fee + q.tip))",
              "pm.test('trae el estado del local', () => pm.expect(q.store).to.have.property('open'))",
            ),
          },
        ),
        json(
          'Los precios que manda el cliente se ignoran (A4)',
          'quote-order',
          {
            items: [{ ...orderItems[0], price: 1, unit_price: 1, line_total: 1 }],
            total: 1,
            subtotal: 1,
            type: 'pickup',
            schedule: { mode: 'asap' },
          },
          {
            tests: check(
              200,
              "pm.test('total real, no el falsificado', () => pm.expect(pm.response.json().total).to.be.above(1000))",
            ),
          },
        ),
        json(
          'Producto inexistente → 409',
          'quote-order',
          {
            items: [{ product_id: '00000000-0000-4000-8000-000000000000', quantity: 1, modifier_ids: [] }],
            type: 'pickup',
            schedule: { mode: 'asap' },
          },
          {
            tests: check(
              409,
              "pm.test('código', () => pm.expect(pm.response.json().error.code).to.eql('ITEM_UNAVAILABLE'))",
            ),
          },
        ),
      ],
    },
    {
      name: 'create-order',
      item: [
        json(
          'Pedido de retiro en efectivo',
          'create-order',
          {
            idempotency_key: '{{idempotency_key}}',
            items: orderItems,
            type: 'pickup',
            schedule: { mode: 'asap' },
            customer: { name: 'Ana Prueba', phone: '11 1234-5678' },
            payment: { method: 'cash', cash_paid_with: 50000 },
          },
          {
            prerequest: [
              "pm.collectionVariables.set('idempotency_key', crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4())",
            ],
            tests: [
              '// 409 STORE_CLOSED es una respuesta válida cuando el local está cerrado a esta hora',
              "pm.test('201 creado o 409 cerrado', () => pm.expect([201, 409]).to.include(pm.response.code))",
              'if (pm.response.code === 201) {',
              '  const r = pm.response.json()',
              "  pm.collectionVariables.set('order_code', r.order.code)",
              "  pm.collectionVariables.set('order_token', r.order.public_token)",
              "  pm.test('arranca en cocina', () => pm.expect(r.order.status).to.eql('received'))",
              "  pm.test('no es un replay', () => pm.expect(r.replayed).to.eql(false))",
              '}',
            ],
          },
        ),
        json(
          'Reintento con la misma clave → mismo pedido (idempotente)',
          'create-order',
          {
            idempotency_key: '{{idempotency_key}}',
            items: orderItems,
            type: 'pickup',
            schedule: { mode: 'asap' },
            customer: { name: 'Ana Prueba', phone: '11 1234-5678' },
            payment: { method: 'cash', cash_paid_with: 50000 },
          },
          {
            tests: [
              "if (pm.collectionVariables.get('order_code')) {",
              "  pm.test('200 replay', () => pm.response.to.have.status(200))",
              "  pm.test('mismo código', () => pm.expect(pm.response.json().order.code).to.eql(pm.collectionVariables.get('order_code')))",
              "  pm.test('replayed=true', () => pm.expect(pm.response.json().replayed).to.eql(true))",
              '}',
            ],
          },
        ),
        json(
          'Misma clave con otro carrito → 422',
          'create-order',
          {
            idempotency_key: '{{idempotency_key}}',
            items: [{ product_id: HORCHATA, quantity: 1, modifier_ids: [] }],
            type: 'pickup',
            schedule: { mode: 'asap' },
            customer: { name: 'Ana Prueba', phone: '11 1234-5678' },
            payment: { method: 'cash' },
          },
          {
            tests: [
              "if (pm.collectionVariables.get('order_code')) {",
              "  pm.test('422 clave reutilizada', () => { pm.response.to.have.status(422); pm.expect(pm.response.json().error.code).to.eql('IDEMPOTENCY_KEY_REUSED') })",
              '}',
            ],
          },
        ),
        json(
          'Honeypot lleno → éxito falso, no se crea nada',
          'create-order',
          {
            idempotency_key: '11111111-1111-4111-8111-111111111111',
            website: 'http://spam.example',
            items: orderItems,
            type: 'pickup',
            schedule: { mode: 'asap' },
            customer: { name: 'Bot', phone: '11 1234-5678' },
            payment: { method: 'cash' },
          },
          {
            tests: check(
              201,
              "pm.test('código falso', () => pm.expect(pm.response.json().order.code).to.eql('TK-0000'))",
            ),
          },
        ),
        json(
          'Teléfono inválido → 422',
          'create-order',
          {
            idempotency_key: '22222222-2222-4222-8222-222222222222',
            items: orderItems,
            type: 'pickup',
            schedule: { mode: 'asap' },
            customer: { name: 'Ana', phone: '12345' },
            payment: { method: 'cash' },
          },
          {
            tests: check(
              422,
              "pm.test('VALIDATION_ERROR', () => pm.expect(pm.response.json().error.code).to.eql('VALIDATION_ERROR'))",
            ),
          },
        ),
        json(
          'Delivery con Mercado Pago (queda pending_payment)',
          'create-order',
          {
            idempotency_key: '33333333-3333-4333-8333-333333333333',
            items: orderItems,
            type: 'delivery',
            delivery: { zone_id: ZONE, street: 'Av. Siempreviva', number: '742' },
            schedule: { mode: 'asap' },
            customer: { name: 'Ana Prueba', phone: '11 1234-5678' },
            payment: { method: 'mercado_pago' },
          },
          {
            prerequest: [
              "pm.collectionVariables.set('mp_idempotency_key', crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4())",
            ],
            tests: [
              "pm.test('201 creado o 409 cerrado', () => pm.expect([201, 409]).to.include(pm.response.code))",
              'if (pm.response.code === 201) {',
              '  const r = pm.response.json()',
              "  pm.collectionVariables.set('mp_order_code', r.order.code)",
              "  pm.collectionVariables.set('mp_order_token', r.order.public_token)",
              "  pm.test('espera el pago', () => { pm.expect(r.order.status).to.eql('pending_payment'); pm.expect(r.next.action).to.eql('pay_mercado_pago') })",
              '}',
            ],
          },
        ),
      ],
    },
    {
      name: 'get-order',
      item: [
        json(
          'Seguimiento con código y token',
          'get-order',
          { code: '{{order_code}}', token: '{{order_token}}' },
          {
            tests: [
              "if (pm.collectionVariables.get('order_code')) {",
              "  pm.test('200', () => pm.response.to.have.status(200))",
              '  const o = pm.response.json()',
              "  pm.test('sin datos personales', () => { const t = JSON.stringify(o).toLowerCase(); ['phone','telefono','customer','street'].forEach(k => pm.expect(t).to.not.include(k)) })",
              '}',
            ],
          },
        ),
        json(
          'Token incorrecto → 404',
          'get-order',
          { code: '{{order_code}}', token: 'x'.repeat(64) },
          { tests: check(404) },
        ),
        json(
          'Código incorrecto → mismo 404',
          'get-order',
          { code: 'TK-9999', token: '{{order_token}}' },
          { tests: check(404) },
        ),
      ],
    },
    {
      name: 'create-mp-preference',
      item: [
        json(
          'Crear el checkout del pedido pendiente',
          'create-mp-preference',
          { order_code: '{{mp_order_code}}', public_token: '{{mp_order_token}}' },
          {
            description:
              'Requiere MP_ACCESS_TOKEN (de PRUEBA) cargado como secret. Devuelve el init_point de sandbox.',
            tests: [
              "if (pm.collectionVariables.get('mp_order_code')) {",
              "  pm.test('200 con init_point', () => { pm.response.to.have.status(200); pm.expect(pm.response.json().init_point).to.include('mercadopago') })",
              '}',
            ],
          },
        ),
        json(
          'Pedido en efectivo no se puede pagar con MP → 409',
          'create-mp-preference',
          { order_code: '{{order_code}}', public_token: '{{order_token}}' },
          {
            tests: [
              "if (pm.collectionVariables.get('order_code')) { pm.test('ORDER_NOT_PAYABLE', () => { pm.response.to.have.status(409); pm.expect(pm.response.json().error.code).to.eql('ORDER_NOT_PAYABLE') }) }",
            ],
          },
        ),
      ],
    },
    {
      name: 'mp-webhook (simulado)',
      description:
        'Simula notificaciones de Mercado Pago firmadas con x-signature (HMAC-SHA256 del manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`). El webhook consulta el pago a la API de MP: con un payment_id real del sandbox el pedido pasa a "received"; con uno inexistente responde 404/502. Para la prueba determinística usá MP_API_BASE (sandbox) apuntando a un stub.',
      item: [
        {
          name: 'Firma válida, tópico distinto de payment → 200 ignorado',
          event: [
            pre(
              'const ts = Math.floor(Date.now() / 1000)',
              "const requestId = 'postman-' + ts",
              "const dataId = '123456'",
              'const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`',
              "const sig = CryptoJS.HmacSHA256(manifest, pm.environment.get('mp_webhook_secret') || '').toString(CryptoJS.enc.Hex)",
              "pm.variables.set('mp_signature', `ts=${ts},v1=${sig}`)",
              "pm.variables.set('mp_request_id', requestId)",
            ),
            js(
              "pm.test('200', () => pm.response.to.have.status(200))",
              "pm.test('ignorado', () => pm.expect(pm.response.json().ignored).to.eql(true))",
            ),
          ],
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'x-signature', value: '{{mp_signature}}' },
              { key: 'x-request-id', value: '{{mp_request_id}}' },
            ],
            url: {
              raw: '{{base_url}}/mp-webhook?data.id=123456&type=merchant_order',
              host: ['{{base_url}}'],
              path: ['mp-webhook'],
              query: [
                { key: 'data.id', value: '123456' },
                { key: 'type', value: 'merchant_order' },
              ],
            },
            body: {
              mode: 'raw',
              raw: JSON.stringify({ type: 'merchant_order', data: { id: '123456' } }),
              options: { raw: { language: 'json' } },
            },
          },
        },
        {
          name: 'Firma inválida → 401',
          event: [
            js(
              "pm.test('401', () => pm.response.to.have.status(401))",
              "pm.test('INVALID_SIGNATURE', () => pm.expect(pm.response.json().error.code).to.eql('INVALID_SIGNATURE'))",
            ),
          ],
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              {
                key: 'x-signature',
                value: 'ts=1,v1=0000000000000000000000000000000000000000000000000000000000000000',
              },
              { key: 'x-request-id', value: 'forged' },
            ],
            url: {
              raw: '{{base_url}}/mp-webhook?data.id=123456&type=payment',
              host: ['{{base_url}}'],
              path: ['mp-webhook'],
              query: [
                { key: 'data.id', value: '123456' },
                { key: 'type', value: 'payment' },
              ],
            },
            body: {
              mode: 'raw',
              raw: JSON.stringify({ type: 'payment', data: { id: '123456' } }),
              options: { raw: { language: 'json' } },
            },
          },
        },
        {
          name: 'Sin firma → 401',
          event: [js("pm.test('401', () => pm.response.to.have.status(401))")],
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            url: {
              raw: '{{base_url}}/mp-webhook?data.id=123456&type=payment',
              host: ['{{base_url}}'],
              path: ['mp-webhook'],
              query: [
                { key: 'data.id', value: '123456' },
                { key: 'type', value: 'payment' },
              ],
            },
            body: { mode: 'raw', raw: '{}', options: { raw: { language: 'json' } } },
          },
        },
      ],
    },
    {
      name: 'staff (JWT de admin)',
      item: [
        json(
          'cloudinary-sign sin sesión → 401',
          'cloudinary-sign',
          { kind: 'menu', slug: 'taco-al-pastor' },
          { tests: check(401) },
        ),
        json(
          'cloudinary-sign como admin → firma',
          'cloudinary-sign',
          { kind: 'menu', slug: 'taco-al-pastor' },
          {
            auth: staffAuth,
            description: 'Pegá el access token de un admin en la variable staff_jwt del environment.',
            tests: [
              "if (pm.environment.get('staff_jwt')) {",
              "  pm.test('200 con firma', () => { pm.response.to.have.status(200); const d = pm.response.json(); pm.expect(d.signature).to.be.a('string'); pm.expect(JSON.stringify(d)).to.not.include('api_secret') })",
              '}',
            ],
          },
        ),
        json(
          'invite-staff sin sesión → 401',
          'invite-staff',
          { email: 'cocina@takitho.test', role: 'kitchen' },
          { tests: check(401) },
        ),
      ],
    },
  ],
}

const env = (name, baseUrl) => ({
  name,
  values: [
    { key: 'base_url', value: baseUrl, type: 'default', enabled: true },
    { key: 'publishable_key', value: '', type: 'secret', enabled: true },
    { key: 'staff_jwt', value: '', type: 'secret', enabled: true },
    { key: 'mp_webhook_secret', value: '', type: 'secret', enabled: true },
  ],
})

const out = path.join(ROOT, 'postman')
mkdirSync(out, { recursive: true })
writeFileSync(path.join(out, 'takitho.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n')
writeFileSync(
  path.join(out, 'takitho-local.postman_environment.json'),
  JSON.stringify(env('Takitho local', 'http://127.0.0.1:54321/functions/v1'), null, 2) + '\n',
)
writeFileSync(
  path.join(out, 'takitho-prod.postman_environment.json'),
  JSON.stringify(env('Takitho prod', 'https://[COMPLETAR].supabase.co/functions/v1'), null, 2) + '\n',
)
console.log('postman/ written')
