# QA manual de Mercado Pago (sandbox y producción)

El e2e automatizado (`tests/e2e/delivery-mp.spec.ts`) cubre todo el flujo hasta la preferencia y simula el webhook firmado con los handlers reales (ADR-0014). Lo que **no** se puede automatizar es el pago dentro de Mercado Pago; se prueba a mano con esta guía.

## Sandbox (proyecto `takitho-dev`)

1. Secrets: `MP_ACCESS_TOKEN=TEST-…`, `MP_ENV=sandbox`, `MP_WEBHOOK_SECRET` de la app de prueba. Webhook apuntando a `…/functions/v1/mp-webhook`.
2. Creá usuarios de prueba (vendedor y comprador) en developers.mercadopago.com.ar → Cuentas de prueba.
3. Hacé un pedido de delivery eligiendo Mercado Pago y confirmá.
4. En Mercado Pago pagá con una tarjeta de prueba publicada en su documentación (aprobada, y también una rechazada).

| Caso | Esperado |
|---|---|
| Pago aprobado | Al volver, el pedido muestra "Recibimos tu pedido" (puede tardar unos segundos: llega por el webhook). Cocina lo ve con la marca ¡Nuevo!. |
| Volver sin pagar (botón "volver") | El pedido sigue "Esperando pago" con el botón "Pagar con Mercado Pago". Cocina **no** lo ve. |
| Pago rechazado | El pedido sigue esperando pago; se puede reintentar desde el seguimiento. |
| Webhook repetido | Sin cambios: el segundo aviso se ignora (idempotente). |
| Monto distinto al del pedido | No se marca pagado y aparece un aviso en `/admin` (Resumen → Avisos). |
| Pago aprobado tras vencer el pedido | Aviso "Pago tardío" en `/admin`: se resuelve a mano (reembolso desde Mercado Pago). |
| Nadie paga | A los 30 min (configurable en `/admin/local`) el pedido se cancela solo. |

## Producción

Con credenciales de producción, un pedido real de $1.00 con tarjeta propia: verificar los mismos casos de "aprobado" y "volver sin pagar", y reembolsar desde Mercado Pago. Revisá en Supabase → Edge Functions → `mp-webhook` → Logs que no haya firmas inválidas.
