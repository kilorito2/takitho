# PLAN — Takitho

> Fase 0 · Fecha: 2026-10-21 · ⏸ Esperando OK para empezar la Fase 1.

## 1. Equivalencias de skills

Las skills `ecc:*` del brief no están instaladas; se usan estas equivalentes.

| Pedida | Usada |
|---|---|
| ecc:plan-prd | `agent-skills:spec` / `spec-driven-development` + `plan` |
| ecc:architecture-decision-records | `agent-skills:documentation-and-adrs` |
| ecc:frontend-design-direction | `frontend-design:frontend-design` + `impeccable` |
| ecc:react-build, ecc:frontend-ui-engineering | `agent-skills:build` + `frontend-ui-engineering` + `vercel-react-best-practices` |
| ecc:motion-foundations / motion-patterns | `animate`, `apple-design`, `find-animation-opportunities` |
| ecc:react-test, ecc:react-review | `agent-skills:test` + `test-driven-development`, `agent-skills:review` |
| ecc:security-review | `security-review` + `agent-skills:security-and-hardening` |
| agent-skills:* | las instaladas con ese nombre |

## 2. Fases, entregables y compuertas

| Fase | Módulos | Entregables | Compuerta de salida |
|---|---|---|---|
| **0 Plan** ✔ | — | PRD, SPEC, API, ADR 0001–0014, CONSTRAINTS, CLAUDE.md, este plan | **Tu OK** |
| **1 Marca** | M-brand | 3 conceptos de logo en SVG + PNG → elección justificada (legible a 16 px); variantes en `public/brand/`; `generate-icons.mjs`; `BRAND.md`; tokens; 30–35 fotos de menú en `takitho/menu` | Vos elegís logo; contraste AA verificado; ningún producto sin foto |
| **2 Base** | M-core (TDD), M-ui | Scaffold Vite+React+TS+Tailwind v4; `git init`; lint/format/tests; core puro con tests; Button, Sheet, Modal, Chip, Ticket, Badge, Toast, Skeleton; fachada, papel picado, talavera, pizarrón | `check:task` verde; herramientas de CONSTRAINTS instaladas |
| **3 Backend** | M-data, M-orders-api, M-media-api | Migraciones, RLS, funciones SQL, seed, tipos, Edge Functions, colección Postman | Tests SQL/contrato verdes; criterio A4 verificado |
| **4 Cliente** | M-customer | Home, menú, ficha, carrito, checkout (sin MP aún), tracking básico | e2e 1 (retiro + efectivo) verde |
| **5 Pagos** | M-payments | create-mp-preference, mp-webhook, retorno, reintento, tracking realtime | e2e 2 + QA manual sandbox registrado |
| **6 Cocina** | M-kitchen | Tablero, sonido, timers, impresión, PWA, reconexión | e2e 3 + latencia < 2 s medida |
| **7 Admin** | M-admin | Dashboard, pedidos, menú, promos, local, mesas/QR, staff | A2 y A6 verificados |
| **8 Calidad** | M-quality | Cobertura, axe, Lighthouse, review de seguridad, simplificación | Todo `check:full` verde |
| **9 Marketing** | M-marketing | Menú A3, flyer 1080×1350, historia 1080×1920, tarjetas QR (Canva); video opcional | Revisión tuya |
| **10 Docs y deploy** | M-ship | README (Windows), `.env.example`, `vercel.json`, deploy Vercel + Supabase prod, checklist go-live | A9: levantar de cero siguiendo el README |

## 3. Qué necesito de vos (y cuándo)

| Cuándo | Qué | Cómo |
|---|---|---|
| Ya (para Fase 1) | OK a este plan y respuestas a las preguntas de §5 | Responder acá |
| Fase 2 | Instalar herramientas de seguridad | Puedo correr `winget install …` con tu permiso |
| Antes de Fase 3 | Crear proyecto Supabase **dev** (y luego prod) y loguear el CLI | Crear en supabase.com; en esta sesión: `! npx supabase login` |
| Antes de Fase 3 | Cuenta de Cloudinary conectada (ya está el MCP) y API key/secret para la función de firma | Dashboard de Cloudinary → API Keys |
| Antes de Fase 5 | App en Mercado Pago Developers + usuarios de prueba + credenciales de test (access token, webhook secret) | developers.mercadopago.com.ar |
| Fase 9 | Autenticar Canva MCP | Pedirá login |
| Fase 10 | Cuenta Vercel, dominio (opcional), datos reales del local | — |

## 4. Riesgos principales (resumen; detalle en PRD §8)

1. Versiones muy nuevas del stack → se verifica compatibilidad al scaffoldear (ADR-0001).
2. Créditos de generación de imágenes de Cloudinary → se consulta el uso antes del lote.
3. Sandbox de Mercado Pago no automatizable de punta a punta → estrategia en dos capas (ADR-0014).
4. Sin Docker: pruebas de DB contra Supabase cloud dev (ADR-0002).
5. Servidores MCP: **Postman** y **Canva** pueden requerir autenticación; **Cloudinary-mediaflows** falló al conectar (no lo necesitamos: usamos el MCP de Cloudinary de assets).

## 5. Decisiones que necesito confirmar

1. **ADR-0013** — Token secreto en la URL de seguimiento (`/pedido/TK-0427?t=…`) en lugar de solo el código. Recomendado.
2. **ADR-0014** — E2E de MP: webhook firmado + stub de la API de MP en automático y prueba manual en sandbox real. Recomendado.
3. **Funciones extra** a las 5 del brief: `quote-order` (totales reales en vivo y cupón) e `invite-staff` (alta de staff). Recomendado.
4. **Dónde vive `SPEC.md`**: `docs/SPEC.md` (como pide tu estructura).
5. **Compuertas** de `CONSTRAINTS.md`: bloquean si fallan; números de §3 del archivo.

## 6. Notas de cumplimiento del brief

- Presupuesto cero: no se usa ninguna API paga; Semgrep va en CI para no depender de Docker.
- No se usan Webflow, WeWeb, Vuetify, Three.js, Gmail, Calendar, Drive ni Goodnotes.
- Los datos reales quedan como `[COMPLETAR]` en el seed: dirección, WhatsApp, horarios, alias/CVU, redes y zonas.
