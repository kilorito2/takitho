# ADR-0004: Precios autoritativos en el servidor; core puro compartido por copia sincronizada

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
El front necesita calcular totales para mostrar la vista previa al instante; el servidor tiene que ser la verdad. Duplicar la lógica a mano garantiza divergencias. El front corre en Vite/Node-style TS y las Edge Functions corren en Deno: importar un archivo fuera de `supabase/functions` desde una función no es confiable en todos los modos de despliegue, y los symlinks en Windows son frágiles.

## Decision
- La lógica vive en módulos TS **puros, sin dependencias** (sin React, Supabase, DOM ni `Date.now()` implícito): `src/lib/pricing.ts`, `hours.ts`, `orderStatus.ts`, `money.ts`, `phone.ts`.
- La fuente canónica es `src/lib/`. El script `scripts/sync-shared.mjs` los copia a `supabase/functions/_shared/` (con extensiones `.ts` en los imports internos, que Deno exige) y `npm run sync:shared -- --check` falla si difieren. Se corre en `check:fast` y en CI.
- El front usa `pricing.ts` solo para vista previa; **el total que se muestra en la confirmación proviene de `quote-order`**, y el que se cobra proviene de `create-order`.
- Los módulos reciben datos y "ahora" por parámetro → deterministas y testeables sin mocks.

## Alternatives Considered
- **Import relativo directo desde `supabase/functions`** hacia `src/lib`: más simple, pero depende de cómo el CLI empaqueta archivos fuera del directorio. Se prueba en la Fase 3; si funciona de forma confiable en el despliegue remoto, se reemplaza la copia por el import y se supersede este ADR.
- **Paquete npm interno / workspace:** sobre-ingeniería para un repo.
- **Mover la lógica a SQL:** una sola implementación, pero no sirve para la vista previa instantánea sin round-trip.

## Consequences
- Una copia generada en el repo (con cabecera "NO EDITAR") y un check que evita deriva.
- Cualquier cambio de reglas se testea una vez (unit) y aplica a ambos lados.
