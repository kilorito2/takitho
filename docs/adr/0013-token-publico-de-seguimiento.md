# ADR-0013: Token público no adivinable para el seguimiento del pedido

## Status
Proposed — **desvío respecto del brief; requiere tu OK**

## Date
2026-10-21

## Context
El brief define `/pedido/:codigo` con códigos cortos tipo `TK-0427`. Un código de 4 dígitos que reinicia cada día tiene ~10 000 combinaciones: cualquiera podría enumerar `/pedido/TK-0001…` y espiar nombres, ítems y estados de otros clientes. El brief también pide que `get-order` devuelva "solo datos no sensibles", pero el nombre, las notas y el hecho de que alguien pidió algo siguen siendo datos personales.

## Decision
- El **código corto** (`TK-0427`) se mantiene como identificador humano: se muestra, se dice en voz alta en el mostrador y aparece en la comanda.
- Cada pedido tiene además un `public_token` aleatorio (≥ 128 bits, URL-safe) generado en el servidor. La URL de seguimiento es `/pedido/TK-0427?t=<token>`.
- `get-order` requiere `code` **y** `token`; ante cualquier fallo responde un `404` idéntico.
- El canal Broadcast del cliente usa el token (ADR-0006).
- "Mis pedidos" guarda `{code, token}` en el dispositivo.
- El WhatsApp "Avisar al local" incluye el código, no el token.
- Si alguien entra a `/pedido/TK-0427` sin token, ve una pantalla "Ingresá con el link que te dimos" y la posibilidad de buscar en "Mis pedidos" del dispositivo.

## Alternatives Considered
- **Código largo/aleatorio como único identificador (p. ej. `TK-7QF4-9XKD`):** más difícil de dictar en el mostrador. Se prefiere separar identificador humano de secreto.
- **Dejar solo el código corto y limitar con rate limit:** reduce pero no elimina la enumeración. Rechazado.

## Consequences
- Si el cliente pierde el link (cambia de celu) no puede ver el seguimiento; el local puede informarle el estado por WhatsApp usando el código. Aceptado.
- Pequeña desviación del contrato literal del brief; si preferís el comportamiento original, se puede revertir cambiando `get-order` y la URL.
