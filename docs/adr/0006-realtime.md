# ADR-0006: Estrategia de Realtime

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
La cocina debe ver pedidos en < 2 s; el cliente debe ver su estado sin recargar; el menú debe reflejar cambios del admin. Pero **la tabla `orders` no puede ser legible por `anon`** (tiene nombre y teléfono). Un canal de Postgres Changes "filtrado por código" para anónimos exigiría un SELECT público.

## Decision
1. **Staff:** *Postgres Changes* sobre `orders` con suscripción autenticada; RLS decide qué filas ve cada rol. Al (re)conectar se hace un *refetch* completo; los eventos solo mejoran la latencia.
2. **Cliente:** *Broadcast* en el canal `order:<public_token>`. Un trigger en `orders` emite (con `realtime.send`) un payload mínimo `{status, payment_status, estimated_minutes, at}`. El token no es adivinable (ADR-0013), así que el canal no filtra información a terceros. Como respaldo, *polling* a `get-order` cada 15 s mientras la pestaña esté visible.
3. **Menú:** *Postgres Changes* sobre `products`, `modifiers`, `store_settings` (lectura pública por RLS) que invalida las queries de TanStack Query.
4. Indicador de conexión visible en cocina (`SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT`), reconexión con backoff exponencial y *refetch* al volver el foco.
5. La campanita suena por evento `INSERT` (o `UPDATE` a `received` para MP aprobados), deduplicando por `order.id` para no repetir.

## Alternatives Considered
- **Hacer `orders` legible por anon con filtro por código:** expone PII. Rechazado.
- **Solo polling:** simple, pero no cumple < 2 s sin castigar el free tier.
- **WebSocket propio:** innecesario con Realtime incluido.

## Consequences
- Hay que verificar con la doc vigente cómo emitir broadcasts desde triggers y si los canales públicos requieren políticas en `realtime.messages` (Fase 3).
- Límites free tier de Realtime (conexiones concurrentes y mensajes/s) sobran para el volumen esperado.
