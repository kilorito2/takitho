# ADR-0007: Mercado Pago Checkout Pro; el webhook es la única fuente de "pagado"

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
Checkout Pro redirige al usuario a Mercado Pago y vuelve por `back_url`. Esa vuelta la controla el navegador del usuario: se puede falsear (`?status=approved`). Solo la notificación firmada de MP, verificada contra su API, es confiable.

## Decision
- Flujo: `create-order` (status `pending_payment`) → `create-mp-preference` → redirect → `mp-webhook` marca pagado y pasa a `received`.
- `external_reference = order.id`. Una preferencia con un único ítem por el total del pedido (evita discrepancias de redondeo entre ítems y total).
- El webhook: verifica `x-signature` (HMAC-SHA256 con `MP_WEBHOOK_SECRET`, comparación en tiempo constante), **consulta el pago a la API de MP**, valida moneda y monto contra `orders.total`, y registra el evento con `UNIQUE(mp_payment_id, mp_status)` para ser idempotente. Responde 200 salvo fallo transitorio nuestro.
- `back_url` solo navega a `/pedido/:codigo`, que muestra "Confirmando tu pago…" hasta que Realtime/polling informe `payment_status='paid'`.
- Cocina no ve el pedido hasta `received`.
- `pending_payment` vence a los 30 min (`expire_pending_payments`, pg_cron). Pago aprobado tardío sobre pedido cancelado → alerta de reembolso manual en admin.
- Credenciales de test en dev (`MP_ENV=sandbox`), de producción solo en el proyecto prod. Secrets únicamente en Supabase Functions secrets.
- Se usa `fetch` directo a la API REST de MP en las funciones (menos peso que el SDK en Deno), salvo que la doc vigente recomiende lo contrario. *Se verifica la API actual (preferencias, firma, payments) al implementar la Fase 3/5.*

## Alternatives Considered
- **Checkout API / Bricks (formulario embebido):** más control visual pero más PCI y complejidad. Fuera del brief.
- **Confiar en `back_url`:** inseguro. Rechazado.
- **Reembolsos automáticos:** fuera de v1.

## Consequences
- El E2E contra el sandbox real depende de usuarios de prueba y de interacción en el dominio de MP (ver ADR-0014).
- El admin necesita una acción "reconsultar pago" por si se perdió un webhook.
