# SPEC — Takitho

> Estado: borrador para aprobación (Fase 0) · Complementa a `PRD.md`, `API.md` (contratos), `adr/` y `/CONSTRAINTS.md`.
> Ubicación: `docs/SPEC.md` (así lo pide el brief; no hay copia en la raíz para no duplicar).

## 0. Mapa de capacidades

El pedido agrupa varias capacidades independientes y testeables. Se construyen en este orden; la flecha significa "depende de".

| Id | Módulo | Qué es | Depende de | Fase |
|---|---|---|---|---|
| **M-brand** | Marca | Logo, paleta, tipografías, tokens, íconos, fotos del menú | — | 1 |
| **M-core** | Núcleo puro | `pricing.ts`, `hours.ts`, `orderStatus.ts`, `money.ts`, `phone.ts`: TS sin dependencias, compartido front + Edge | — | 2 |
| **M-ui** | Sistema de diseño | Tokens `@theme`, componentes base, ilustraciones SVG | M-brand | 2 |
| **M-data** | Datos | Migraciones, RLS, funciones SQL (transiciones, rate limit, códigos), seed, tipos | M-core (reglas) | 3 |
| **M-orders-api** | API de pedidos | `quote-order`, `create-order`, `get-order` | M-data, M-core | 3 |
| **M-media-api** | API de medios | `cloudinary-sign`, helper de URLs | M-data | 3 |
| **M-customer** | App cliente | Inicio, menú, ficha, carrito, checkout, seguimiento, mis pedidos, 404/error | M-ui, M-orders-api | 4 |
| **M-payments** | Pagos | `create-mp-preference`, `mp-webhook`, retorno y reintento de pago | M-orders-api, M-customer | 5 |
| **M-kitchen** | Cocina | Tablero realtime, sonido, timers, impresión, PWA | M-ui, M-data | 6 |
| **M-admin** | Admin | Dashboard, pedidos, menú, promos, local, mesas/QR, staff (`invite-staff`) | M-ui, M-data, M-media-api | 7 |
| **M-quality** | Calidad | Tests, a11y, Lighthouse, review de seguridad | todos | 8 |
| **M-marketing** | Marketing | Canva (menú A3, flyer, historia, QR de mesa), video opcional | M-brand | 9 |
| **M-ship** | Docs y deploy | README, Vercel, Supabase prod, checklist go-live | todos | 10 |

Dirección de dependencias en el código (se vigila con dependency-cruiser):

```
lib/ (core puro)  ←  features/*  ←  app/ (router, providers)
components/ui     ←  features/*
features/*        ✗  features/*   (los features no se importan entre sí; comparten por lib/ o components/)
lib/              ✗  React, Supabase, DOM   (core puro)
```

---

## 1. Objetivo

Construir "Takitho": sistema de pedidos online de una taquería de barrio argentina. Ver `PRD.md` para problema, usuarios, alcance y reglas de negocio. Criterios de éxito en §12.

**Principios de producto**
1. Mobile-first (90 % celular). Se diseña a 360 px y se escala.
2. El servidor decide el precio, el horario y la disponibilidad; el cliente solo muestra.
3. Cada pantalla es "una parte del localcito" (hero fachada, menú pizarrón, carrito comanda, seguimiento riel, cocina oscura, admin sobrio).
4. Cero lorem ipsum: todo texto es final o `[COMPLETAR]`.

## 2. Comandos

Windows / PowerShell. Scripts npm cross-platform (`rimraf`, `cross-env`; nunca `rm -rf` ni `export`).

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias |
| `npm run dev` | Vite dev server (usa `.env` apuntando al Supabase cloud de **dev**) |
| `npm run build` | `tsc -b` + build de producción |
| `npm run preview` | Sirve el build (para Lighthouse/e2e) |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` | Prettier |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` / `test:watch` / `test:cov` | Vitest (unit + componentes) |
| `npm run test:e2e` | Playwright (contra `preview` + Supabase dev) |
| `npm run test:a11y` | axe-core vía Playwright |
| `npm run lighthouse` | Lighthouse mobile contra `preview` |
| `npm run clean` | `rimraf dist coverage .vite playwright-report` |
| `npm run icons` | `node scripts/generate-icons.mjs` (sharp) |
| `npm run svgo` | Optimiza `public/brand/*.svg` |
| `npm run db:link` | `npx supabase link --project-ref <dev>` |
| `npm run db:push` | `npx supabase db push` (aplica migraciones al proyecto linkeado) |
| `npm run db:types` | `npx supabase gen types typescript --project-id <ref> > src/types/database.ts` |
| `npm run db:seed` | Aplica `supabase/seed.sql` al dev (script propio, ver ADR-0002) |
| `npm run fn:deploy` | `npx supabase functions deploy` (todas) |
| `npm run sync:shared` | Copia `src/lib/{pricing,hours,orderStatus,money,phone}.ts` a `supabase/functions/_shared/` (ADR-0004) |
| `npm run check:fast` / `check:task` / `check:full` | Compuertas de `CONSTRAINTS.md` |

## 3. Estructura del proyecto

```
takitho/
  public/brand/                     logos, íconos, og-image (SVG + PNG generados)
  scripts/generate-icons.mjs        sharp → favicon, apple-touch, 192/512, maskable, og-image
  scripts/sync-shared.mjs           copia el core puro a las Edge Functions + verifica igualdad
  src/
    app/                            router, providers (Query, Theme, Toaster), layouts, guards
    features/
      menu/ cart/ checkout/ orders/ kitchen/ admin/
        (cada una: components/, hooks/, api.ts, schemas.ts, *.test.tsx)
    components/ui/                  Button, Sheet, Modal, Chip, Ticket, Badge, Toast, Skeleton, ...
    components/illustrations/       Fachada, PapelPicado, Talavera, Pizarron, Comal, ...
    lib/                            supabase.ts, cloudinary.ts, money.ts, hours.ts, pricing.ts,
                                    orderStatus.ts, phone.ts, audio.ts, sanitize.ts
    styles/                         index.css (@import tailwind + @theme), print.css
    types/                          database.ts (generado), domain.ts
  supabase/
    migrations/                     SQL versionado
    functions/                      create-order, quote-order, get-order, create-mp-preference,
                                    mp-webhook, cloudinary-sign, invite-staff, _shared/
    seed.sql
    config.toml
  docs/                             PRD.md SPEC.md API.md BRAND.md PLAN.md adr/
  tests/e2e/                        Playwright
  CONSTRAINTS.md  CLAUDE.md  README.md  vercel.json  .env.example
```

## 4. Estilo de código

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Sin `any` (regla ESLint `no-explicit-any: error`). Sin `// @ts-ignore`; `@ts-expect-error` solo con motivo y entrada en `CONSTRAINTS.md`.
- Nombres: componentes `PascalCase.tsx`; hooks `useXxx`; utilidades `camelCase.ts`; SQL y columnas `snake_case`; enums de estado en inglés (`received`), textos de UI en es-AR.
- **El core puro (`src/lib/{pricing,hours,orderStatus,money,phone}.ts`) no importa nada** salvo tipos del propio archivo; ni React, ni Supabase, ni `Date.now()` implícito (el "ahora" se inyecta como parámetro).
- Validación solo en los bordes (formularios, Edge Functions, respuestas de terceros como MP). Adentro se confía en los tipos.
- Zod 4 para esquemas; el mismo esquema vive en `features/*/schemas.ts` (front) y se duplica deliberadamente en la función solo cuando es contrato público (ver `API.md`).
- Comentarios solo para el *porqué*. Cero código comentado.
- Estado de servidor → TanStack Query. Estado de UI local → `useState`. Carrito → Zustand `persist` (versionado, con migración). Nada de Redux ni Context para datos.
- Tailwind v4: tokens en `@theme` (`--color-chile`, `--font-display`, etc.). Sin valores mágicos de color en componentes.
- Animaciones: solo `transform`/`opacity`, 150–300 ms, envueltas en `useReducedMotion` / `@media (prefers-reduced-motion)`.
- Dinero: siempre enteros ARS; formateo solo en `money.ts`.
- Fechas: se guardan `timestamptz` UTC; se muestran en `America/Argentina/Buenos_Aires` con `Intl.DateTimeFormat`.
- Íconos: Lucide + SVG propios; nunca emojis como ícono de UI.

## 5. Estrategia de testing

| Capa | Herramienta | Qué cubre | Umbral (ver CONSTRAINTS) |
|---|---|---|---|
| Unit (core puro) | Vitest | precios, modificadores (min/max/required), cupones (%/fijo/2x1/días/vigencia/usos/mínimo), redondeo, vuelto, horarios con cruce de medianoche, franjas de 15 min, transiciones de estado, teléfono AR, sanitizado | ≥ 95 % líneas y ramas en `src/lib` core |
| Componentes | Vitest + Testing Library + `vitest-axe` | Ficha de producto (validación de grupos, precio en vivo), carrito (editar, cupón, aviso de cambios), checkout por pasos | ≥ 80 % en features cubiertas |
| Contrato Edge | Vitest sobre handlers con dependencias inyectadas + colección Postman | `quote/create-order` recalculan; idempotencia; rate limit; firma del webhook | casos críticos listados en `API.md §Casos de prueba` |
| SQL | script de pruebas con `pgTAP` o queries de verificación contra dev | RLS (anon no inserta en `orders`, staff por rol), transiciones inválidas | cada política tiene ≥ 1 test positivo y 1 negativo |
| E2E | Playwright | (1) retiro + efectivo, (2) delivery + MP (ver ADR-0014), (3) cocina recibe y avanza | los 3 flujos en verde |
| A11y | axe-core | cada ruta pública y de staff, claro y oscuro | 0 violaciones |
| Performance | Lighthouse CI (mobile, throttling por defecto) | `/`, `/menu`, `/checkout`, `/pedido/:codigo` | ≥ 90 y LCP < 2,5 s |

Bug fix = test que falla primero (Prove-It). Los tests de TDD se escriben antes que el código del core puro.

## 6. Límites (Boundaries)

**Siempre**
- Recalcular en el servidor precio, modificadores, cupón, envío, total, horario y disponibilidad.
- RLS activo en toda tabla nueva, con test positivo y negativo.
- Verificar la API actual en la documentación oficial antes de usar una librería (Tailwind v4, Supabase, Mercado Pago, React Router).
- Texto final o `[COMPLETAR]`; respetar voseo y es-AR.
- Respetar `prefers-reduced-motion` y `prefers-color-scheme`.
- Dejar el repo en verde (`check:task`) al cerrar cada tarea.

**Preguntar antes**
- Agregar una dependencia que no esté en el stack del brief.
- Cambiar el esquema de forma incompatible con datos ya cargados en prod.
- Usar algo con costo (planes pagos, APIs pagas, créditos de generación si superan el free tier).
- Cualquier acción hacia afuera: deploy a prod, crear/borrar proyectos cloud, enviar mensajes, publicar en Canva/HeyGen, `git push`.
- Bajar un umbral de `CONSTRAINTS.md` o agregar una excepción.

**Nunca**
- Secrets en el repo, en el bundle del front o en logs (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `CLOUDINARY_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
- Insertar en `orders` desde el cliente; confiar en un total que viene del front.
- Marcar un pago aprobado por la `back_url` o por un parámetro de query.
- Estereotipos (sombrero con bigote, caricaturas), emojis como íconos, plantillas shadcn sin personalizar, gradientes violetas, glassmorphism.
- Google Maps API, SMS, Webflow, WeWeb, Vuetify, Three.js, Gmail/Calendar/Drive/Goodnotes.
- Skippear tests, silenciar linters ni bajar umbrales para hacer pasar un cambio.

---

## 7. Pantallas y rutas

### 7.1 Cliente

| Ruta | Pantalla | Notas |
|---|---|---|
| `/` | Inicio | Hero fachada SVG; letrero ABIERTO/CERRADO que gira según horario real; próximo horario; CTA "Hacer pedido"; promos del día; destacados; ubicación (link a Google Maps, sin API); redes |
| `/menu` | Menú / pizarrón | Tabs sticky con scrollspy, buscador, filtros (veggie, sin TACC, picante), cards, agotados deshabilitados. Lee `?mesa=N` y lo guarda en sesión |
| `/menu/:slug` (overlay) | Ficha de producto | Bottom sheet mobile / modal desktop; ruta enlazable que abre sobre el menú |
| (drawer) | Carrito "Tu comanda" | Ticket dentado, mono; editar/eliminar; cupón; aviso de precios/stock cambiados |
| `/checkout` | Checkout por pasos | Tipo → Cuándo → Datos → Pago → Resumen |
| `/pedido/:codigo?t=…` | Confirmación y seguimiento | Realtime; comanda en el riel; WhatsApp; repetir; aria-live |
| `/mis-pedidos` | Historial local | Solo del dispositivo (localStorage) |
| `*` | 404 | "Se nos acabaron las tortillas para esta página" |
| (boundary) | Error | Misma temática, con botón de reintentar |

### 7.2 Staff

| Ruta | Rol | Pantalla |
|---|---|---|
| `/staff/login` | — | Login email + contraseña (Supabase Auth). Sin registro público |
| `/cocina` | cocina, admin | Tablero Nuevos → En preparación → Listos; Entregados colapsado |
| `/admin` | admin | Dashboard |
| `/admin/pedidos`, `/admin/pedidos/:id` | admin | Tabla + detalle + CSV |
| `/admin/menu` | admin | Categorías, productos, modificadores, combos, fotos |
| `/admin/promos` | admin | Cupones, 2x1, días, combos |
| `/admin/local` | admin | Horarios, pausa, zonas, medios de pago, datos |
| `/admin/mesas` | admin | Mesas + QR en PDF |
| `/admin/staff` | admin | Invitar y asignar rol |

Cocina y admin se cargan con `React.lazy` (chunks separados). El rol se verifica en el front (guard) **y** en el back (RLS + `auth_role()`).

## 8. Flujos

### 8.1 Pedido de punta a punta

```
Menú → Ficha (modificadores, nota) → Carrito → Checkout
  → [Paso 5] Confirmar
      ├─ POST quote-order (en cada cambio relevante: tipo, zona, cupón, propina) → totales del servidor
      └─ POST create-order (idempotency_key UUID creado al entrar al paso 5)
            ├─ efectivo / transferencia → status=received, payment_status=pending → /pedido/:codigo
            └─ mercado_pago → status=pending_payment → POST create-mp-preference → redirect a init_point
                   → usuario paga → MP llama mp-webhook → pago aprobado → status=received (cocina lo ve)
                   → usuario vuelve a /pedido/:codigo (back_url) → ve "Confirmando tu pago…" hasta que Realtime avise
```

### 8.2 Estados del pedido

```
pending_payment ─► received ─► preparing ─► ready ─┬► delivered            (retiro / mesa)
                                                   └► out_for_delivery ─► delivered   (delivery)
cualquier estado no terminal ─► cancelled (solo admin, con motivo obligatorio)
```

- `pending_payment` solo existe para Mercado Pago. Expira a los 30 min (configurable) → `cancelled` con motivo "pago no completado".
- Estados terminales: `delivered`, `cancelled`.
- Un salto inválido (ej. `received → ready`) lo rechaza la función `transition_order`.
- `payment_status`: `pending` · `paid` · `failed` · `refunded`. Independiente del estado del pedido.

### 8.3 Cierre / pausa / programado

| Situación | Inmediato | Programado |
|---|---|---|
| Abierto | ✔ | ✔ (franja dentro del horario, ≥ tiempo base) |
| Cerrado por horario | ✘ ("Estamos cerrados, prendemos el comal a las 19 h") | ✔ (franjas dentro del próximo horario) |
| Cierre manual | ✘ | ✘ hasta reabrir (configurable) |
| Pausa de pedidos | ✘ | ✔ |

### 8.4 Horario que cruza medianoche

Cada fila de `opening_hours` es `(weekday, opens_at, closes_at)`. Si `closes_at <= opens_at` el turno termina al día siguiente. A las 00:30 del lunes el local está abierto si el domingo tiene un turno 19:00–01:00. El "día de negocio" (para códigos de pedido y reportes) cambia a las 06:00 hora local. Detalle y casos en ADR-0010.

## 9. Reglas de precio (módulo `pricing.ts`)

1. `unit_total = precio_base + Σ price_delta(modificadores elegidos)`.
2. `line_total = unit_total × cantidad`.
3. `subtotal = Σ line_total`.
4. Cupón (uno por pedido) sobre `subtotal` (no sobre envío ni propina):
   - `percent`: `Math.round(subtotal_elegible × pct / 100)`.
   - `fixed`: `min(monto, subtotal_elegible)`.
   - `2x1`: entre las unidades elegibles, se regala la mitad inferior (`floor(n/2)` unidades, las de menor `unit_total`).
   - Condiciones: vigencia, días de semana (zona horaria AR), `min_purchase` (sobre subtotal), `max_uses` totales y `max_uses_per_phone`, alcance (todo / categoría / productos).
5. `discount ≤ subtotal`.
6. Pedido mínimo de zona: `subtotal − discount ≥ zone.min_order`.
7. `delivery_fee` = costo de la zona (solo delivery).
8. `tip` ≥ 0, entero, tope 100 % del subtotal.
9. `total = subtotal − discount + delivery_fee + tip`.
10. Efectivo: `cash_paid_with ≥ total`; `vuelto = cash_paid_with − total`.

Validación de modificadores por grupo: `required ⇒ min ≥ 1`; cantidad elegida ∈ [`min`, `max`]; modificador debe pertenecer al producto y estar disponible.

## 10. Edge cases (lista de verificación)

**Menú y carrito**
- Producto agotado mientras estaba en el carrito → aviso y se bloquea el checkout hasta quitarlo.
- Precio cambió → aviso con el delta; el servidor igual cobra el precio vigente.
- Producto/modificador eliminado → se quita con aviso.
- Carrito persistido de una versión vieja del esquema → migración o descarte seguro.
- Cantidad máxima por línea: 20.
- `?mesa=N` inválido o mesa inactiva → se ignora y se ofrece retiro/delivery.

**Checkout**
- Teléfono: formatos `011 1234-5678`, `+54 9 11 1234 5678`, `1112345678` → normaliza a E.164 `+549…`; rechaza lo que no sea AR plausible.
- Delivery sin zona o por debajo del mínimo → bloquea con mensaje claro.
- Programado: franja vencida mientras completa el formulario → pide elegir otra.
- Doble clic en "Confirmar" / reintento por mala señal → mismo `idempotency_key` ⇒ mismo pedido, nunca duplicado.
- Misma key con distinto cuerpo → 422.
- Efectivo con `cash_paid_with < total` → error de campo.
- Honeypot completo → respuesta fingida de éxito, sin crear pedido.
- Rate limit excedido → 429 con `retry_after`.

**Pagos**
- Usuario cierra la pestaña de MP sin pagar → pedido queda `pending_payment`; en `/pedido/:codigo` botón "Reintentar pago" (genera nueva preferencia).
- Webhook duplicado / fuera de orden → idempotente por `(mp_payment_id, status)`.
- Pago aprobado con monto distinto al total → no se aprueba; queda `payment_status=pending` y alerta en admin.
- Pago aprobado después de que el pedido expiró (`cancelled`) → `payment_status=paid`, alerta "reembolsar" en admin.
- Firma inválida → 401 y log; no se procesa.
- `back_url` con `status=approved` en la query → se ignora; solo manda el webhook.

**Tiempo real**
- Se corta WiFi en cocina → banner "Sin conexión", reconexión con backoff, al volver se hace *refetch* completo (no se confía solo en eventos).
- Dos cocinas avanzan el mismo pedido → la transición inválida del segundo devuelve el estado actual y la UI se actualiza.
- Cliente sin Realtime (red restrictiva) → *polling* cada 15 s como respaldo.

**Cocina**
- Audio bloqueado por el navegador → botón "Activar sonido" visible hasta desbloquear.
- Pedido nuevo con la app en segundo plano → título parpadeante + sonido; Wake Lock para que no duerma.
- Impresión: ancho 58/80 mm persistido por dispositivo.

**Admin**
- Borrar categoría/producto con pedidos históricos → *soft delete* (`is_active=false`); los pedidos conservan su *snapshot*.
- Cambiar precio no altera pedidos existentes.
- Subida de foto falla a mitad → el producto conserva la foto anterior.
- Último admin no puede quitarse el rol ni desactivarse.
- Exportar CSV con `;` y BOM UTF-8 (Excel en es-AR).

**Horario / zona horaria**
- Dispositivo en otra zona horaria → toda lógica usa `America/Argentina/Buenos_Aires`.
- Reloj del dispositivo desfasado → el servidor es la autoridad; el front puede corregir con el header `Date` de la respuesta.

## 11. Estados de UI (cada pantalla)

Toda pantalla define: **cargando** (skeleton o tortilla en el comal), **vacío** (microcopy temático), **error** (mensaje + reintentar), **offline** (menú cacheado; checkout deshabilitado con aviso) y **éxito**. Detalle de microcopy en `BRAND.md` (Fase 1).

## 12. Criterios de aceptación y cómo se verifican

| # | Criterio | Verificación |
|---|---|---|
| A1 | Pedido desde el celu con modificadores, MP sandbox y estado en vivo sin recargar | E2E 2 + checklist manual sandbox |
| A2 | Efectivo y transferencia funcionan y quedan pendientes de cobro en admin | E2E 1 + test de admin "pendiente de cobro" |
| A3 | Cocina recibe con sonido en < 2 s y avanza hasta entregado | E2E 3 con medición de latencia (Realtime) |
| A4 | Manipular precios en DevTools no cambia el total del servidor | Test de contrato: `create-order` con totales/precios falsos → total correcto |
| A5 | Cerrado/pausa bloquea inmediatos; cruce de medianoche correcto | Unit `hours.ts` + test de contrato `create-order` |
| A6 | Cambio de precio/agotado en admin se refleja al instante en el menú | E2E con dos contextos; Realtime en `products` |
| A7 | Logo en todas sus variantes, favicons y og-image | Script `icons` + checklist de archivos |
| A8 | Lighthouse mobile ≥ 90, axe 0 errores, tests verdes | `check:full` |
| A9 | El deploy funciona; el README levanta el proyecto de cero en Windows | Prueba en carpeta limpia siguiendo el README |
