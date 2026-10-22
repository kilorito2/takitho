# ADR-0008: Idempotencia y rate limiting en Postgres

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
En celulares con mala señal el cliente reintenta; un doble pedido es plata y comida perdidas. También hay que frenar abuso de `create-order` sin servicios pagos (sin Redis, sin Upstash).

## Decision
**Idempotencia**
- El cliente genera un `idempotency_key` (UUID v4) **una vez** al entrar al paso Resumen y lo reutiliza en cada reintento; se regenera solo si cambia el contenido del pedido. Nunca se deriva de timestamps ni se crea por intento.
- El servidor reclama la key con un `INSERT … ON CONFLICT DO NOTHING` sobre `orders.idempotency_key` (única) guardando `request_hash` (SHA-256 del cuerpo canonicalizado). El *constraint* único decide al ganador; no hay "SELECT y después INSERT".
- Misma key + mismo hash → se devuelve el pedido existente (`replayed: true`). Misma key + hash distinto → `422 IDEMPOTENCY_KEY_REUSED`. Pedido en construcción → `409 IDEMPOTENCY_IN_FLIGHT`.
- Retención: las keys viven con el pedido (no se purgan antes de 7 días; cubre reintentos y la ventana de disputas de MP).
- El webhook de MP es idempotente por `UNIQUE(mp_payment_id, mp_status)` (ADR-0007).

**Rate limiting**
- Tabla `rate_limits(key, window_start, count)` y función `check_rate_limit(key, max, window_s)` con `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count` (atómica).
- Claves: `ip:<hash>` y `phone:<hash>`. Valores iniciales (configurables): `create-order` 5 por 10 min por IP y 3 por 10 min por teléfono; `quote-order` 60 por 10 min por IP.
- La IP se toma de `x-forwarded-for`/`cf-connecting-ip` y se guarda **hasheada** con sal.
- Honeypot (`website`) en el checkout; Cloudflare Turnstile opcional (se activa por variable de entorno; la función exige token solo si hay `TURNSTILE_SECRET`).
- Limpieza de ventanas viejas por pg_cron.

## Alternatives Considered
- **Redis/Upstash:** pago o con dependencias extra. Rechazado por presupuesto cero.
- **Rate limit en memoria de la función:** las instancias son efímeras y múltiples; no es confiable.

## Consequences
- Un par de escrituras extra por request; despreciable al volumen esperado.
- IPs compartidas (CGNAT de celulares) pueden pegarle al límite por IP: los números son configurables y el mensaje de 429 incluye `retry_after`.
