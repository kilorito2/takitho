# ADR-0001: Stack del frontend

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
SPA mobile-first, con tres superficies (cliente, cocina, admin), mucha animación con propósito y requisito de Lighthouse ≥ 90 en celular. El brief cierra el stack. Versiones estables relevadas con `npm view` el 2026-10-21.

## Decision
| Pieza | Elección | Versión relevada |
|---|---|---|
| Build | Vite + `@vitejs/plugin-react` | 8.3.5 |
| UI | React | 19.3.1 |
| Lenguaje | TypeScript `strict` | 6.0.x (ver nota) |
| Estilos | Tailwind CSS v4 + `@tailwindcss/vite`, tokens en `@theme` | 4.3.3 |
| Ruteo | React Router (modo *library/data router*, no framework) | 8.5.0 |
| Estado de servidor | TanStack Query | 5.104.5 |
| Carrito | Zustand + `persist` | 5.0.15 |
| Formularios | React Hook Form + Zod + `@hookform/resolvers` | 7.90.0 / 4.6.7 |
| Animación | `motion` | 14.5.0 |
| Íconos | `lucide-react` + SVG propios | 1.61.0 |
| Gráficos (solo admin, lazy) | Recharts | 3.10.1 |
| PWA | `vite-plugin-pwa` | 2.0.0 |
| Fuentes | `@fontsource/*` (self-hosted, subset latin) | 5.3.0 |
| Drag & drop | `@dnd-kit/*` (kitchen y admin) | 6.3.1 |
| Tests | Vitest, Testing Library, Playwright, `@axe-core/playwright` | 5.0.5 / 16.3.3 / 1.64.1 / 4.14.0 |
| Lint/format | ESLint + typescript-eslint, Prettier | 10.13.0 / 3.9.10 |

Reglas de adopción:
- **Verificar antes de fijar.** Varias versiones son muy recientes (TypeScript 7, Vite 8, React Router 8, vite-plugin-pwa 2). En la Fase 2 se comprueba que `typescript-eslint`, Vitest, el plugin PWA y Tailwind funcionan con esa combinación; si algo no, se baja **solo esa pieza** a la última versión compatible y se anota acá.
- Dependencias exactas (`save-exact`) + `package-lock.json` commiteado.
- Todo lo fuera de esta tabla requiere OK (ver Boundaries en SPEC).

**Nota (Fase 2):** se usa TypeScript **6.0** y no 7.0: es la versión que fija la plantilla oficial de Vite 9 y la que soporta el ecosistema (typescript-eslint, Vitest). Se revisa cuando el ecosistema soporte 7. El resto de las versiones de la tabla se instalaron tal cual; `@hookform/resolvers` 6 requiere `legacy-peer-deps` (peers opcionales de `effect`), registrado en `.npmrc`. ESLint se mantiene (no oxlint, que trae la plantilla) por el brief y por las reglas con tipos.

## Alternatives Considered
- **Next.js:** SSR/SEO nativo, pero el brief fija Vite; el SEO se resuelve con meta tags + JSON-LD estático y la página principal es liviana. Rechazado.
- **CSS Modules / vanilla-extract:** más control, pero Tailwind v4 con `@theme` da tokens + velocidad. Rechazado.
- **Redux Toolkit:** innecesario; Query + Zustand cubren el estado.
- **react-beautiful-dnd:** deprecado; `@dnd-kit` está mantenido y soporta touch.

## Consequences
- Bundle inicial bajo: cocina y admin en chunks `lazy`; Recharts/jsPDF/qrcode solo se cargan en admin.
- Riesgo de fricción por versiones nuevas; mitigado con la regla de verificación.
