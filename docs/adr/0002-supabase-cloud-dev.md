# ADR-0002: Supabase como backend; entorno de desarrollo en la nube (sin Docker)

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
Necesitamos Postgres + RLS, Auth de staff, Realtime y funciones serverless con costo cero. En esta máquina **no hay Docker Desktop**, así que `npx supabase start` (stack local) y `supabase functions serve` no están disponibles. El plan gratuito de Supabase permite 2 proyectos activos.

## Decision
- Backend: Supabase (Postgres, Auth, Realtime, Edge Functions en Deno). CLI vía `npx supabase` (v2.121.0 relevada).
- **Dos proyectos cloud:** `takitho-dev` (desarrollo, e2e, sandbox de MP) y `takitho-prod`. Ambos en plan gratuito.
- Migraciones en `supabase/migrations`, aplicadas con `npx supabase db push` al proyecto linkeado. Seed en `supabase/seed.sql`, aplicado al dev con un script propio (`db:seed`), porque sin Docker no hay `db reset`.
- Funciones: `npx supabase functions deploy` (el bundling remoto no requiere Docker). Los secrets con `npx supabase secrets set`.
- Tipos: `npx supabase gen types typescript --project-id <ref>` → `src/types/database.ts`.
- Un `mp-webhook` accesible públicamente sirve a ambos: el dev recibe webhooks reales del sandbox sin túneles.
- Si más adelante se instala Docker, `supabase start` es un reemplazo directo (las migraciones son las mismas).

## Alternatives Considered
- **Supabase local con Docker:** ideal para tests aislados, pero no está instalado y Docker Desktop en Windows requiere WSL2 y recursos; no lo imponemos. Queda como mejora.
- **Un solo proyecto para dev y prod:** riesgo de romper datos reales. Rechazado.
- **Firebase / PlanetScale:** sin RLS en Postgres ni Realtime relacional equivalente. Rechazado por el brief.

## Consequences
- Los tests e2e y de RLS corren contra el proyecto dev (hay que limpiar datos de prueba con un prefijo y un script).
- Latencia de red en cada comando de DB; aceptable.
- Proyectos gratuitos se pausan tras ~7 días sin actividad: prod con uso diario no es problema; se documenta un keep-alive y el checklist de go-live.
- El usuario debe ejecutar `npx supabase login` (interactivo) y crear los proyectos: está listado en `PLAN.md`.
