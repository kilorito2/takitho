# ADR-0005: Máquina de estados del pedido validada en Postgres

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
Cocina, admin, el webhook de MP y el job de expiración pueden cambiar el estado de un pedido, a veces a la vez. Si la UI es la única que valida, un doble toque o dos tablets producen saltos inválidos.

## Decision
- Tabla `order_status_transitions(order_type, from_status, to_status)` con las transiciones permitidas y función `transition_order(order_id, new_status, reason)` (`SECURITY DEFINER`).
  - `pending_payment → received`
  - `received → preparing → ready`
  - `ready → delivered` (pickup, dine_in) · `ready → out_for_delivery → delivered` (delivery)
  - cualquier no terminal → `cancelled` (solo admin, `reason` obligatorio)
- La función toma el pedido con `SELECT … FOR UPDATE`, valida, actualiza y escribe `order_status_history` en la misma transacción.
- Los roles `kitchen`/`admin` **no tienen `UPDATE` directo** sobre `orders.status`; solo ejecutan la función. El trigger `BEFORE UPDATE` rechaza cambios de `status` que no vengan de la función.
- El mismo grafo existe en `src/lib/orderStatus.ts` (puro) para habilitar/deshabilitar botones en la UI; un test verifica que ambas definiciones coinciden (el seed de transiciones se genera desde la constante TS).
- La transición inválida devuelve el estado actual para que la UI se corrija.

## Alternatives Considered
- **Validar solo en el cliente/Edge Function:** carreras entre staff. Rechazado.
- **Estados como enum + CHECK sin tabla:** no expresa la diferencia por tipo de pedido.

## Consequences
- Una pequeña capa de SQL con tests propios.
- Cambios futuros del flujo = migración de datos de la tabla de transiciones.
