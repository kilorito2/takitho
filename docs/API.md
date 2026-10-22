# API y esquema — contratos

> Estado: borrador para aprobación (Fase 0). Los contratos son la fuente; la implementación los sigue (contract-first).
> Se verifican contra la doc oficial vigente de Supabase y Mercado Pago al empezar la Fase 3 (ver riesgos en `PLAN.md`).

## 1. Convenciones

- Base: `https://<ref>.supabase.co/functions/v1/<nombre>`. Método `POST` con JSON (salvo `get-order`: `POST` también, para no poner el token en la URL/logs).
- Campos JSON en **snake_case** (alineados con la DB).
- Dinero: enteros ARS. Fechas: ISO 8601 UTC. Teléfono: E.164 (`+5491112345678`).
- **Error único** para todas las funciones:

```ts
type ApiError = {
  error: {
    code: string          // machine-readable, UPPER_SNAKE
    message: string       // es-AR, apto para mostrar al usuario
    details?: unknown     // ej. zod.flatten(), ids no disponibles
  }
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `BAD_REQUEST` | JSON inválido |
| 401 | `UNAUTHENTICATED` / `INVALID_SIGNATURE` | falta sesión (staff) / firma de MP inválida |
| 403 | `FORBIDDEN` | rol insuficiente |
| 404 | `NOT_FOUND` | pedido/código/token inexistente |
| 409 | `ITEM_UNAVAILABLE` · `IDEMPOTENCY_IN_FLIGHT` · `STORE_CLOSED` · `STORE_PAUSED` | conflicto de estado actual |
| 422 | `VALIDATION_ERROR` · `IDEMPOTENCY_KEY_REUSED` · `BELOW_MIN_ORDER` · `INVALID_COUPON` · `INVALID_SLOT` · `INVALID_MODIFIERS` | datos semánticamente inválidos |
| 429 | `RATE_LIMITED` | incluye `details.retry_after_s` |
| 500 | `INTERNAL` | nunca expone detalles internos |

- CORS: solo orígenes configurados (`ALLOWED_ORIGINS`). `OPTIONS` responde 204.
- Autenticación: funciones públicas aceptan la *anon/publishable key*; funciones de staff exigen `Authorization: Bearer <jwt de usuario>` y validan rol adentro. `mp-webhook` no usa JWT (verifica firma). Ver ADR-0003.
- Evolución: solo se agregan campos opcionales. Quitar o cambiar tipo de un campo requiere nueva función/versión (`create-order-v2`).

## 2. Tipos compartidos

```ts
type OrderType = 'pickup' | 'delivery' | 'dine_in'
type PaymentMethod = 'mercado_pago' | 'cash' | 'transfer'
type OrderStatus =
  | 'pending_payment' | 'received' | 'preparing' | 'ready'
  | 'out_for_delivery' | 'delivered' | 'cancelled'
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

type CartLineInput = {
  product_id: string            // uuid
  quantity: number              // 1..20
  modifier_ids: string[]        // uuids, repetidos permitidos si el grupo admite cantidad (v1: sin repetidos)
  note?: string                 // ≤ 140 chars, se sanitiza
}

type OrderInput = {
  items: CartLineInput[]                       // 1..30 líneas
  type: OrderType
  coupon_code?: string
  delivery?: {                                 // obligatorio si type='delivery'
    zone_id: string
    street: string; number: string
    floor_apt?: string; references?: string
  }
  table_number?: number                        // obligatorio si type='dine_in'
  schedule: { mode: 'asap' } | { mode: 'scheduled'; at: string /* ISO, múltiplo de 15 min */ }
  tip?: number                                 // entero ≥ 0
}

type Quote = {
  lines: { product_id: string; name: string; unit_total: number; quantity: number; line_total: number;
           modifiers: { modifier_id: string; name: string; price_delta: number }[] }[]
  subtotal: number
  discount: number
  coupon: { code: string; kind: 'percent' | 'fixed' | 'two_for_one'; label: string } | null
  delivery_fee: number
  tip: number
  total: number
  estimated_minutes: number | null             // null si es programado
  store: { open: boolean; paused: boolean; next_open_at: string | null }
  warnings: { code: 'PRICE_CHANGED' | 'ITEM_UNAVAILABLE' | 'MODIFIER_UNAVAILABLE'; product_id?: string; details?: unknown }[]
}
```

## 3. Edge Functions

### 3.1 `quote-order` (público) — *agregada al brief*

Calcula el total real **sin crear nada**. Es lo que muestra el checkout y el carrito (con cupón). Misma tubería que `create-order`.

- **Request:** `OrderInput`
- **200:** `Quote`
- **Errores:** `VALIDATION_ERROR`, `ITEM_UNAVAILABLE` (con `details.product_ids`), `INVALID_COUPON`, `BELOW_MIN_ORDER`, `RATE_LIMITED` (límite más laxo que `create-order`).
- Efectos secundarios: ninguno.

### 3.2 `create-order` (público)

- **Request**
```ts
type CreateOrderRequest = OrderInput & {
  idempotency_key: string            // uuid v4, generado una vez al entrar al paso Resumen
  customer: { name: string /* 2..60 */; phone: string /* AR, se normaliza */ }
  payment: { method: PaymentMethod; cash_paid_with?: number /* solo cash, ≥ total */ }
  website?: string                   // honeypot: debe venir vacío
  turnstile_token?: string           // opcional si Turnstile está activo
}
```
- **Pasos del servidor (en orden):**
  1. Rate limit por IP y por teléfono (`check_rate_limit`).
  2. Honeypot / Turnstile.
  3. Validar con Zod.
  4. Reclamar la idempotency key con `INSERT … ON CONFLICT` (única en `orders.idempotency_key`) guardando `request_hash`.
     - Existe y mismo hash → devolver el pedido ya creado (200, `replayed: true`).
     - Existe y distinto hash → `422 IDEMPOTENCY_KEY_REUSED`.
     - Existe, en curso → `409 IDEMPOTENCY_IN_FLIGHT`.
  5. Leer de la DB (service role) productos, modificadores, cupón, zona, mesa y ajustes; **ignorar cualquier precio del cliente**.
  6. Verificar horario/pausa/cierre (`hours.ts` con la hora del servidor), disponibilidad, grupos de modificadores, mínimos, franja programada.
  7. Calcular con `pricing.ts` (mismo módulo que el front).
  8. Insertar `orders` + `order_items` + `order_item_modifiers` (snapshots) + `order_status_history` en una transacción (función SQL `create_order_tx`), generar `code`.
  9. Estado inicial: `pending_payment` si MP; `received` si efectivo/transferencia.
- **201:**
```ts
type CreateOrderResponse = {
  order: { id: string; code: string /* TK-0427 */; public_token: string; status: OrderStatus;
           payment_status: PaymentStatus; total: number; estimated_minutes: number | null }
  next: { action: 'track' } | { action: 'pay_mercado_pago' }   // el front llama create-mp-preference
  replayed: boolean
}
```
- **Errores:** todos los de la tabla §1; además `STORE_CLOSED` / `STORE_PAUSED` solo para `mode:'asap'`.
- **Idempotente:** sí (por `idempotency_key`). Retención de keys: 7 días como mínimo (cubre reintentos del cliente y ventana de disputa de MP).

### 3.3 `create-mp-preference` (público, con token del pedido)

- **Request:** `{ order_code: string; public_token: string }`
- **Reglas:** el pedido debe estar `pending_payment` y `payment_method='mercado_pago'`. Crea (o recrea) la preferencia con:
  - un único ítem "Pedido TK-0427 — Takitho" por el `total` del pedido (ARS),
  - `external_reference = order.id`,
  - `notification_url = <functions>/mp-webhook`,
  - `back_urls` y `auto_return: 'approved'` hacia `/pedido/:codigo?t=…`,
  - `expires`/`date_of_expiration` alineado con la expiración de `pending_payment`.
- **200:** `{ init_point: string; sandbox_init_point?: string; preference_id: string }`. En test se usa `sandbox_init_point` si `MP_ENV=sandbox`.
- **Errores:** `NOT_FOUND`, `409 ORDER_NOT_PAYABLE`, `502 MP_UNAVAILABLE`.
- Guarda `mp_preference_id`. Llamarla de nuevo (reintento de pago) crea una preferencia nueva y reemplaza la anterior.

### 3.4 `mp-webhook` (sin JWT; autenticado por firma)

- **Entrada:** `POST` de Mercado Pago, query `?data.id=<payment_id>&type=payment` y headers `x-signature` (`ts=…,v1=…`), `x-request-id`.
- **Verificación:** manifest `id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;` → HMAC-SHA256 con `MP_WEBHOOK_SECRET` → comparación en tiempo constante con `v1`. Falla → `401 INVALID_SIGNATURE`. (Se confirma el formato en la doc vigente al implementar.)
- **Proceso:**
  1. Ignorar `type` ≠ `payment` (200).
  2. `GET /v1/payments/{id}` a la API de MP con `MP_ACCESS_TOKEN` (**no se confía en el cuerpo del webhook**).
  3. Resolver pedido por `external_reference`. Comprobar `currency_id='ARS'` y `transaction_amount == order.total`.
  4. Registrar el evento en `payment_events` con `UNIQUE (mp_payment_id, mp_status)` → si ya existe, 200 sin hacer nada (idempotente).
  5. `approved` → `payment_status='paid'`, `mp_payment_id`, y transición `pending_payment → received` vía `transition_order`. Si el pedido ya estaba `cancelled`: `paid` + alerta de reembolso.
  6. `rejected`/`cancelled` → `payment_status='failed'` (el pedido queda `pending_payment` para reintentar hasta expirar).
  7. `refunded`/`charged_back` → `payment_status='refunded'` + alerta.
- **Respuestas:** `200` para todo lo procesado o ignorable (para que MP no reintente), `401` firma inválida, `5xx` solo ante fallo transitorio nuestro (MP reintenta).

### 3.5 `get-order` (público, con token)

- **Request:** `{ code: string; token: string }`
- **200:**
```ts
type PublicOrder = {
  code: string; status: OrderStatus; type: OrderType
  payment_method: PaymentMethod; payment_status: PaymentStatus
  created_at: string; scheduled_for: string | null; estimated_minutes: number | null
  items: { name: string; quantity: number; modifiers: string[]; note: string | null; line_total: number }[]
  subtotal: number; discount: number; delivery_fee: number; tip: number; total: number
  table_number: number | null
  history: { status: OrderStatus; at: string }[]
  store: { whatsapp: string; name: string }          // para el botón "Avisar al local"
  transfer?: { alias: string; cbu: string; holder: string }   // solo si method='transfer' y payment_status='pending'
}
```
- **No devuelve:** teléfono, dirección completa, notas internas, ids de MP, IP.
- **Errores:** `404 NOT_FOUND` (idéntico si falla el código o el token, para no filtrar existencia).

### 3.6 `cloudinary-sign` (staff admin)

- **Request:** `{ kind: 'menu' | 'brand'; slug?: string }` con JWT admin (`slug` arma el `public_id` estable `takitho/menu/<slug>`).
- **200:** `{ cloud_name, api_key, timestamp, signature, public_id, params, upload_url }` (firma `SHA-1` de los parámetros ordenados + `CLOUDINARY_API_SECRET`). El navegador sube directo a Cloudinary; luego el admin guarda el `public_id` en `products`.
- **Errores:** `401`, `403`.

### 3.7 `invite-staff` (staff admin) — *agregada al brief*

- **Request:** `{ email: string; role: 'admin' | 'kitchen' }` con JWT admin.
- Usa `auth.admin.inviteUserByEmail` con service role; crea/actualiza `profiles`. Solo admin. No se puede dejar el sistema sin admin.

### 3.8 Tiempo real (no es función)

| Canal | Tipo | Quién | Contenido |
|---|---|---|---|
| `staff:orders` | Postgres Changes sobre `orders` (INSERT/UPDATE) | cocina y admin autenticados; RLS filtra por rol | fila del pedido (sin PII extra a quien no la necesita) |
| `order:<public_token>` | Broadcast público, emitido por trigger en `orders` | cliente en `/pedido/:codigo` | `{ status, payment_status, estimated_minutes, at }` |
| `menu` | Postgres Changes sobre `products`, `modifiers`, `store_settings` (lectura pública) | cliente | invalida caché de TanStack Query |

## 4. Esquema (resumen DDL)

Todas las tablas: `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` (trigger), salvo singleton/históricas. **RLS habilitado en todas.**

| Tabla | Columnas principales | Notas |
|---|---|---|
| `store_settings` | `id smallint pk check (id=1)`, `name`, `address`, `maps_url`, `whatsapp`, `instagram`, `facebook`, `tiktok`, `transfer_alias`, `transfer_cbu`, `transfer_holder`, `prep_minutes`, `timer_warn_minutes`, `timer_late_minutes`, `is_paused`, `is_closed_manually`, `accepts_scheduled_when_closed`, `max_schedule_days`, `pay_mp_enabled`, `pay_cash_enabled`, `pay_transfer_enabled`, `tip_presets int[]`, `timezone default 'America/Argentina/Buenos_Aires'`, `pending_payment_ttl_min default 30`, `public_url` | Singleton. Vista `store_settings_public` expone solo columnas no sensibles |
| `opening_hours` | `weekday smallint 0..6`, `opens_at time`, `closes_at time`, `is_active` | Varias filas por día = varias franjas. `closes_at <= opens_at` ⇒ cruza medianoche |
| `profiles` | `id uuid pk → auth.users`, `full_name`, `role enum('admin','kitchen')`, `is_active` | Trigger crea perfil al invitar |
| `categories` | `name`, `slug unique`, `description`, `sort int`, `is_active` | |
| `products` | `category_id`, `type enum('single','combo')`, `name`, `slug unique`, `description`, `price int check (>=0)`, `image_public_id`, `spicy_level 0..3`, `tags text[]` (`veggie`,`sin_tacc`,`picante`,`destacado`), `is_available`, `is_active`, `sort`, `unit_label` | `price` en ARS enteros |
| `combo_items` | `combo_id`, `product_id`, `quantity` | Composición fija (para mostrar y para cocina) |
| `modifier_groups` | `name`, `min_select`, `max_select`, `is_required`, `sort` | `check (max_select >= min_select)`; `is_required ⇒ min_select >= 1` |
| `modifiers` | `group_id`, `name`, `price_delta int`, `is_available`, `sort` | |
| `product_modifier_groups` | `product_id`, `group_id`, `sort` | pk compuesta |
| `delivery_zones` | `name`, `neighborhoods text[]`, `fee int`, `min_order int`, `is_active`, `sort` | |
| `coupons` | `code unique nullable`, `label`, `kind enum('percent','fixed','two_for_one')`, `value int`, `scope enum('all','category','products')`, `scope_ids uuid[]`, `weekdays smallint[]`, `starts_at`, `ends_at`, `max_uses`, `max_uses_per_phone`, `min_purchase`, `auto_apply bool`, `is_active` | `code` nulo si es promo automática |
| `coupon_redemptions` | `coupon_id`, `order_id`, `phone`, `discount` | `unique(coupon_id, order_id)` |
| `tables` | `number int unique`, `label`, `is_active` | |
| `orders` | `code`, `business_date date`, `public_token`, `idempotency_key unique`, `request_hash`, `status`, `type`, `customer_name`, `customer_phone`, `delivery_street/number/floor_apt/references`, `zone_id`, `table_id`, `scheduled_for`, `subtotal`, `delivery_fee`, `discount`, `tip`, `total`, `coupon_id`, `payment_method`, `payment_status`, `mp_preference_id`, `mp_payment_id`, `cash_paid_with`, `paid_at`, `cancel_reason`, `estimated_minutes`, `client_ip_hash` | `unique(business_date, code)`; índices por `status`, `created_at` |
| `order_items` | `order_id`, `product_id`, `name_snapshot`, `unit_price_snapshot`, `quantity`, `line_total`, `note` | |
| `order_item_modifiers` | `order_item_id`, `modifier_id`, `name_snapshot`, `price_delta_snapshot` | |
| `order_status_history` | `order_id`, `from_status`, `to_status`, `actor_id`, `reason`, `at` | Append-only |
| `payment_events` | `order_id`, `mp_payment_id`, `mp_status`, `raw jsonb`, `unique(mp_payment_id, mp_status)` | Idempotencia del webhook |
| `idempotency_*` | (columnas en `orders`) | ver ADR-0008 |
| `rate_limits` | `key text`, `window_start timestamptz`, `count int`, pk `(key, window_start)` | Limpieza por cron |

### Funciones SQL (todas `SECURITY DEFINER` con `search_path` fijo)

| Función | Para qué |
|---|---|
| `auth_role()` | Devuelve el rol del usuario actual (para políticas RLS) |
| `transition_order(order_id, new_status, reason)` | Valida la transición contra `order_status_transitions` (según `type`), escribe historial, actualiza `orders`. Solo staff autorizado o service role |
| `mark_order_paid(order_id)` | Admin marca efectivo/transferencia cobrado |
| `create_order_tx(payload jsonb)` | Inserta pedido + ítems + modificadores + historial de forma atómica y genera `code` |
| `next_order_code(business_date)` | `TK-` + contador diario con padding a 4 |
| `check_rate_limit(key, max, window_s)` | Upsert atómico; devuelve si pasó y `retry_after` |
| `expire_pending_payments()` | Cron (pg_cron cada 5 min): cancela `pending_payment` vencidos |
| `notify_order_change()` | Trigger → broadcast a `order:<public_token>` |

### Matriz RLS

| Tabla | anon | cocina | admin | service role (Edge) |
|---|---|---|---|---|
| `categories`, `products`, `modifier_groups`, `modifiers`, `product_modifier_groups`, `combo_items`, `delivery_zones`, `opening_hours` | SELECT solo `is_active` | SELECT | ALL | ALL |
| `store_settings` | **ninguno** (usa la vista pública) | SELECT | ALL | ALL |
| `coupons`, `coupon_redemptions`, `tables` | **ninguno** | SELECT (`tables`) | ALL | ALL |
| `orders`, `order_items`, `order_item_modifiers`, `order_status_history` | **ninguno** (ni insert) | SELECT; cambios solo vía `transition_order` | SELECT; cambios vía funciones | ALL |
| `payment_events`, `rate_limits` | ninguno | ninguno | SELECT (`payment_events`) | ALL |
| `profiles` | ninguno | SELECT propio | ALL | ALL |
| Storage | — (no se usa Supabase Storage; imágenes en Cloudinary) | | | |

## 5. Casos de prueba de contrato (mínimo)

1. `create-order` con `unit_price` / `total` falsificados en el body → ignora y devuelve el total correcto (A4).
2. Misma `idempotency_key` x2 → un solo pedido (`replayed: true`); con otro cuerpo → 422.
3. Producto agotado → 409 con ids; modificador de otro producto → 422 `INVALID_MODIFIERS`.
4. Grupo con `min=1,max=2`: 0 y 3 elegidos → 422; 1 y 2 → ok.
5. Cupón vencido / fuera de día / sin usos / bajo mínimo → `INVALID_COUPON` con motivo.
6. Local cerrado: `asap` → 409; `scheduled` dentro del próximo horario → 201.
7. Horario 19:00–01:00: 00:30 del lunes con turno del domingo → abierto.
8. Rate limit: N+1 pedidos por IP/teléfono → 429.
9. Honeypot completo → 201 simulado sin fila en `orders`.
10. `mp-webhook`: firma válida + `approved` → pedido `received`; repetido → sin cambios; firma inválida → 401; monto distinto → no aprueba.
11. `get-order`: token incorrecto → 404 idéntico a código inexistente; la respuesta no contiene teléfono ni dirección.
12. RLS: `anon` hace `INSERT` en `orders` → denegado; `kitchen` hace `UPDATE products` → denegado; `kitchen` salta `received → ready` → rechazado por `transition_order`.
