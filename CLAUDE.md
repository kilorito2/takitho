# Takitho — instrucciones para agentes

Sistema de pedidos online de una taquería de barrio (Argentina). Contexto y reglas en `docs/PRD.md` y `docs/SPEC.md`; contratos en `docs/API.md`; decisiones en `docs/adr/`.

- **Leé `CONSTRAINTS.md` antes de tocar código y nunca lo debilites para hacer pasar un cambio** (no bajes umbrales, no agregues `@ts-ignore`/`eslint-disable`/`.skip`, no borres tests). Si un número molesta, proponelo primero y cambialo ahí con motivo.
- Windows + PowerShell. Scripts npm cross-platform (`rimraf`, `cross-env`); nada de `rm -rf` ni `export`.
- Idioma: código y commits en inglés; UI, docs y microcopy en español rioplatense (voseo). Cero lorem ipsum; usar `[COMPLETAR]` para datos reales faltantes.
- Los precios, el horario y la disponibilidad los decide **siempre el servidor**. Nunca marcar un pago como aprobado por la `back_url`.
- Secrets solo en Supabase Functions secrets / `.env` local ignorado. Nunca en el repo ni en el bundle.
- Antes de usar una librería con API cambiante (Tailwind v4, Supabase, Mercado Pago, React Router) verificá la doc oficial vigente.
- Acciones hacia afuera (deploy a prod, crear/borrar proyectos cloud, `git push`, publicar en Canva/HeyGen, gastar créditos) → preguntar antes.
- Trabajo por fases (`docs/PLAN.md`); al cerrar cada una, resumen corto de qué quedó y qué sigue.
