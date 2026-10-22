# Takitho

Pedidos online para una taquería de barrio (Argentina): carta y checkout para clientes, tablero de cocina en vivo (PWA) y panel de administración. Stack: Vite + React + TypeScript, Tailwind v4, Supabase (Postgres + RLS + Realtime + Edge Functions), Mercado Pago Checkout Pro, Cloudinary, Vercel. Todo corre en planes gratuitos.

- Producto y alcance: `docs/PRD.md` · especificación: `docs/SPEC.md` · contratos: `docs/API.md` · decisiones: `docs/adr/` · marca: `docs/BRAND.md`
- Reglas de calidad que no se bajan: `CONSTRAINTS.md`

## Pantallas

| Ruta                  | Quién         | Qué                                                                          |
| --------------------- | ------------- | ---------------------------------------------------------------------------- |
| `/`, `/menu`          | clientes      | Inicio, carta, hoja de producto, comanda (carrito)                           |
| `/checkout`           | clientes      | Tipo → cuándo → datos → pago → confirmar                                     |
| `/pedido/TK-0001?t=…` | clientes      | Seguimiento en vivo (el `t` es el secreto del link)                          |
| `/mis-pedidos`        | clientes      | Historial de este celular                                                    |
| `/staff/login`        | personal      | Email + contraseña (no hay registro público)                                 |
| `/cocina`             | cocina, admin | Tablero Nuevos → En preparación → Listos, sonido, timers, impresión 58/80 mm |
| `/admin`              | admin         | Resumen, pedidos (CSV), menú, promos, local, mesas (QR en PDF), equipo       |

## Primeros pasos (Windows / PowerShell)

```powershell
npm install
copy .env.example .env.local      # completá los VITE_* (ver abajo)
npm run dev                       # http://localhost:5173
```

Sin proyecto Supabase todavía podés probar todo el flujo con el backend simulado de los tests (`npm run test:e2e`) y ver la carta real con `node scripts/dev/mock-api.ts` + `VITE_SUPABASE_URL=http://localhost:54321`.

### Comandos

| Comando                         | Para qué                                                                |
| ------------------------------- | ----------------------------------------------------------------------- |
| `npm run check:fast`            | tipos + lint + formato + arquitectura + secretos (segundos)             |
| `npm test` / `npm run test:cov` | unitarios, componentes, SQL (PGlite), Edge Functions                    |
| `npm run test:e2e`              | 12 flujos en Chrome (retiro, delivery + Mercado Pago, cocina, admin…)   |
| `npm run test:a11y`             | axe sobre todas las pantallas, claro y oscuro                           |
| `npm run lighthouse`            | Lighthouse móvil sobre las rutas públicas (usa un mock local de la API) |
| `npm run size`                  | presupuesto de bundle (JS de entrada ≤ 165 kB gzip)                     |
| `npm run check:full`            | todo lo anterior                                                        |

## Lo que tenés que hacer vos (no se puede automatizar)

1. **Supabase** (plan gratis). `npx supabase login`, crear dos proyectos (`takitho-dev`, `takitho-prod`), y en cada uno:
   ```powershell
   npx supabase link --project-ref <ref>
   npm run db:push                 # migraciones (esquema, RLS, funciones, cron)
   npm run db:seed                 # carta de ejemplo (lo marcado [COMPLETAR] lo cargás desde /admin)
   npm run fn:deploy               # las 7 Edge Functions
   ```
   En el panel de Supabase → Authentication: **desactivá "Allow new users to sign up"** (el personal entra solo por invitación).
   Para crear el primer administrador: Authentication → Users → _Invite user_ con tu email, y luego en el SQL editor:
   ```sql
   insert into public.profiles (id, full_name, email, role)
   select id, 'Tu nombre', email, 'admin' from auth.users where email = 'tu@email.com';
   ```
   Desde ahí invitás al resto en `/admin/equipo`.
2. **Secrets de las Edge Functions.** Copiá el bloque comentado de `.env.example` a `supabase/.env.functions` (está en `.gitignore`), completalo y corré `npm run secrets:push`. Nunca van al front ni al repo.
3. **Mercado Pago.** Creá una aplicación en developers.mercadopago.com.ar (Checkout Pro), usuarios de prueba y copiá `MP_ACCESS_TOKEN` (de prueba) y la clave secreta del webhook. Configurá la URL de notificación: `https://<proyecto>.supabase.co/functions/v1/mp-webhook` (evento _Pagos_). Guía de prueba en `docs/QA-MERCADOPAGO.md`.
4. **Cloudinary.** Las fotos ya están en `takitho/menu`. Para subir nuevas desde el admin cargá `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` como secrets.
5. **Vercel.** Importá el repo, cargá `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_SITE_URL`. `vercel.json` ya trae la CSP y los headers de seguridad. Si usás otro dominio de Supabase, ajustá `connect-src` en `vercel.json`.
6. **Datos reales.** Entrá a `/admin/local` y reemplazá cada `[COMPLETAR]` (dirección, WhatsApp, redes, alias/CBU, zonas de delivery, horarios). La web no publica nada que siga con ese marcador.

## Cargar y mantener el menú

Todo desde `/admin/menu`: productos (precio, foto, etiquetas, combos), categorías, grupos de opciones (tortilla, salsas, extras). Se ordenan arrastrando o con las flechas. "Agotar" en la cocina o en el admin lo saca de la carta al instante. Los productos no se borran: se ocultan, así los pedidos viejos conservan su detalle.

## Pasar Mercado Pago a producción

1. En `takitho-prod`: `MP_ENV=production` y `MP_ACCESS_TOKEN`/`MP_WEBHOOK_SECRET` de **producción**; configurá el webhook de producción en la app de Mercado Pago.
2. Hacé un pedido real de $1.00 con tarjeta propia y verificá que cocina lo recibe solo después del webhook (`docs/QA-MERCADOPAGO.md`).
3. Un pedido solo pasa a "pagado" por el webhook firmado y verificado contra la API de Mercado Pago, nunca por la vuelta del navegador.

## Checklist de salida a producción

- [ ] `npm run check:full` en verde
- [ ] Migraciones aplicadas y registro público de usuarios desactivado
- [ ] Secrets cargados (`MP_*`, `CLOUDINARY_*`, `ALLOWED_ORIGINS`, `SITE_URL`, `IP_HASH_SALT`)
- [ ] Cero `[COMPLETAR]` en `/admin/local` y en el menú
- [ ] Probado: pedido en efectivo, pedido con Mercado Pago, cocina recibe con sonido, QR de una mesa
- [ ] Dominio propio en Vercel y `VITE_SITE_URL`/`SITE_URL` actualizados
- [ ] Tablet de cocina: abrir `/cocina`, "Instalar app" y activar el sonido

## Seguridad en una línea

RLS en todas las tablas; nadie escribe `orders` salvo la Edge Function (service role); los precios, horarios y disponibilidad los decide siempre el servidor; los secretos viven solo en Supabase; rate limit por IP y teléfono; CSP y headers en `vercel.json`.
