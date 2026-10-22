# PRD — Takitho, pedidos online

> Estado: borrador para aprobación (Fase 0) · Fecha: 2026-10-21

## 1. Problema

Takitho es una taquería chica de barrio en Argentina, con pocas mesas y mucho pedido para llevar y delivery, casi todo de noche. Hoy los pedidos entran por mensajes sueltos: se pierden aclaraciones ("sin cebolla"), hay que calcular a mano el total y el vuelto, nadie sabe en qué estado está cada orden y el cliente pregunta "¿ya salió?" por WhatsApp.

## 2. Objetivo

Un sistema único, dentro de una sola web, donde:

1. El cliente arma el pedido desde el celular, paga como prefiera y lo ve avanzar en vivo.
2. La cocina recibe el pedido al instante (con campanita), lo prepara y lo avanza con un toque.
3. El dueño maneja menú, precios, horarios, promos y ventas sin tocar código.

El costo de infraestructura es **cero** (planes gratuitos de Supabase, Vercel y Cloudinary; sin APIs pagas).

## 3. Usuarios

| Rol | Contexto | Qué necesita |
|---|---|---|
| **Cliente** (invitado, sin cuenta) | Celular, 4G, de noche, con hambre | Pedir en menos de 2 min, saber cuánto sale y cuándo llega, pagar fácil |
| **Cocina** | Tablet horizontal en un mostrador con grasa y apuro | Ver qué hacer ya, botones enormes, sonido, que no se cuelgue con el WiFi |
| **Admin / dueño** | Celu o compu, al cierre o a la mañana | Cambiar precios y stock rápido, ver ventas, cobrar transferencias/efectivo, cargar promos |

## 4. Alcance

### Incluido (v1)

- Web de cliente: inicio, menú, ficha de producto con modificadores, carrito, checkout por pasos, seguimiento, "mis pedidos" local.
- Tipos de pedido: retiro, delivery (por zonas/barrios), comer en el local (mesa desde QR).
- Pagos: Mercado Pago Checkout Pro, efectivo (con vuelto), transferencia (alias/CVU copiable).
- Pedidos inmediatos o programados en franjas de 15 min; horario nocturno que cruza medianoche.
- Pantalla de cocina (PWA instalable, realtime, impresión de comanda 58/80 mm).
- Admin: dashboard, pedidos, menú (CRUD + drag & drop + fotos Cloudinary), promos/cupones/combos, configuración del local, mesas con QR en PDF, staff.
- Identidad de marca completa (logo en variantes, íconos, og-image, BRAND.md) y material de marketing en Canva.
- Backend Supabase con RLS en todas las tablas y Edge Functions como única vía de escritura de pedidos.

### Fuera de alcance (v1)

- Cuentas de cliente, login social, puntos/fidelidad.
- Geocodificación, mapas embebidos, cálculo de envío por distancia (se usan zonas/barrios declarados).
- SMS / notificaciones push al cliente (solo seguimiento en pantalla + botón de WhatsApp manual).
- Facturación electrónica (AFIP/ARCA).
- Multi-sucursal, multi-idioma (solo es-AR).
- Gestión de repartidores (el estado `out_for_delivery` lo marca el staff).
- Reembolsos automáticos desde el sistema (se hacen en el panel de Mercado Pago; el sistema alerta).

## 5. Reglas de negocio clave

- Moneda ARS en enteros (sin centavos). Formato `Intl.NumberFormat('es-AR')`.
- **El servidor es la única fuente de verdad del precio.** El front solo muestra vista previa.
- El pago de Mercado Pago se aprueba **solo** por webhook verificado, nunca por la `back_url`.
- Los pedidos de Mercado Pago no llegan a cocina hasta tener el pago aprobado.
- Efectivo y transferencia llegan a cocina de inmediato y quedan "pendientes de cobro" hasta que el admin los marque.
- Con el local cerrado o en pausa: no hay pedidos inmediatos; sí programados para cuando abra.
- Los estados del pedido no se pueden saltar (validado en Postgres).

## 6. Métricas de éxito (criterios de aceptación)

Se heredan literalmente de la sección 14 del brief y se listan con su verificación en `docs/SPEC.md §12`. Resumen:

- Pedido completo desde el celu con modificadores + MP sandbox + estado en vivo sin recargar.
- Cocina recibe con sonido en < 2 s y avanza hasta entregado.
- Manipular precios en DevTools no cambia el total del servidor.
- Cierre/pausa y cruce de medianoche correctos.
- Cambios de precio/stock en admin se ven al instante en el menú.
- Lighthouse mobile ≥ 90, axe sin errores, tests en verde.
- README permite levantar todo de cero en Windows.

## 7. Supuestos (a confirmar)

| # | Supuesto | Si es falso |
|---|---|---|
| S1 | Usamos 2 proyectos Supabase cloud gratuitos (dev y prod); no hay Docker en esta máquina | Con Docker se podría usar `supabase start` local |
| S2 | El dueño tiene (o crea) cuenta de Mercado Pago y app en Developers con credenciales de prueba y producción | Sin MP, se lanza solo con efectivo/transferencia |
| S3 | Hay un dominio propio o se usa `*.vercel.app` | El QR de mesa y el `notification_url` usan el dominio que se defina |
| S4 | La generación de imágenes de Cloudinary MCP entra en el plan gratuito (créditos) | Se verifica el uso antes de generar; si no alcanza, se priorizan productos y se avisa |
| S5 | Un solo local, una sola cocina, una tablet | Varias tablets funcionan igual (Realtime), sin impresión coordinada |
| S6 | El volumen es bajo (decenas de pedidos por noche) | Los límites free tier (Supabase: 500 MB DB, 2 M invocaciones, 200 conexiones Realtime) sobran |

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Proyecto Supabase gratis se pausa por inactividad (7 días) | Alto en prod | Uso diario real lo evita; cron de keep-alive documentado; checklist go-live |
| Webhook de MP no llega / llega duplicado / llega tarde | Pedido pagado que no aparece | Idempotencia por `mp_payment_id`, reconsulta a la API, botón "reconsultar pago" en admin, expiración de `pending_payment` con alerta si se aprueba después |
| Dependencias muy nuevas (TypeScript 7, Vite 8, React Router 8, vite-plugin-pwa 2) con plugins que aún no las soportan | Bloqueo en la Fase 2 | Verificar compatibilidad al scaffoldear y fijar la última combinación que funcione; está en ADR-0001 |
| Browsers bloquean audio sin gesto | La cocina no suena | Botón "Activar sonido" al abrir la pantalla + indicador visible de mute |
| Tablet duerme la pantalla / pierde WiFi | Pedidos sin ver | Wake Lock, reconexión automática, banner de conexión, re-sync al volver |
| Enumeración de pedidos por código corto (TK-0427) | Fuga de datos | Token público no adivinable en la URL de seguimiento (ADR-0013) |
| Fotos generadas con IA inconsistentes | Menú dispar | Prompt maestro único, revisión visual, regenerar; reemplazo desde admin |
| Lighthouse ≥ 90 con SVG animados y 4 fuentes | Performance | Subsets latin, `font-display: swap`, SVG inline pequeño, lazy por ruta, animaciones solo `transform`/`opacity` |
