# CONSTRAINTS — Takitho

> Contrato de calidad del proyecto. **Los agentes (y las personas) no bajan este listón para que pase un cambio**: si un número molesta, se discute y se cambia acá, con motivo, antes del cambio de código.
> Estado: **herramientas instaladas en la Fase 2**. Activo hoy: typecheck, lint, format, guard, sync del core, tests con cobertura, dependency-cruiser, size-limit, axe, Lighthouse, gitleaks y osv-scanner. Pendiente de ejercitar: e2e (Fase 4+), `test:sql` (Fase 3) y Semgrep (solo CI).
> Última revisión: 2026-10-21 · Responsable: el dueño del repo.

## 1. Detectado

- Carpeta vacía: sin `package.json`, sin tests, sin CI, sin repo git. Node 24, npm 11, PowerShell; **sin Docker**.
- Disponibles en la máquina: `winget`, `gh`, `python 3.13`, `wsl`, Chrome. **No instalados:** `gitleaks`, `osv-scanner`, `semgrep`.

## 2. Piso (no negociable)

| Regla                                                                            | Comando                                            | Por qué                                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| TypeScript `strict` + `noUncheckedIndexedAccess`, sin errores                    | `npm run typecheck`                                | Precios y estados son dinero: los `undefined` silenciosos cuestan caro |
| Cero `any` explícito                                                             | ESLint `@typescript-eslint/no-explicit-any: error` | Brief §11                                                              |
| ESLint y Prettier limpios                                                        | `npm run lint` · `npm run format -- --check`       | Consistencia, revisiones más cortas                                    |
| Sin supresiones nuevas (`@ts-ignore`, `eslint-disable`, `.skip`, `.only`, `xit`) | `scripts/guard.mjs` (revisa el diff)               | Es la forma más común de "arreglar" un check                           |
| Sin secrets en el repo                                                           | `gitleaks detect --redact`                         | Hay tokens de MP, Cloudinary y service role en juego                   |
| `.env` ignorado; `.env.example` documentado                                      | chequeo en `guard.mjs`                             | Brief §10                                                              |
| Core compartido sincronizado                                                     | `npm run sync:shared -- --check`                   | Evita que front y servidor calculen distinto (ADR-0004)                |
| Todo test existente pasa                                                         | `npm test`                                         | —                                                                      |

## 3. Números exigidos

| Dimensión                                                                      | Umbral                                                                                       | Comando                                                             | Por qué ese número                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Cobertura del core puro (`src/lib/{pricing,hours,orderStatus,money,phone}.ts`) | **≥ 95 % líneas y ramas**                                                                    | `npm run test:cov` (umbral por carpeta en `vitest.config`)          | Es donde un bug cobra mal o cierra el local mal        |
| Cobertura de líneas **cambiadas** en `src/features/**`                         | **≥ 80 %**                                                                                   | `npm run check:task` (diff-cover del cambio)                        | Evita deuda sin exigir 100 % a UI                      |
| Transiciones de estado                                                         | 100 % del grafo cubierto (válidas e inválidas)                                               | tests de `orderStatus` + SQL                                        | El brief prohíbe saltar pasos                          |
| RLS                                                                            | Cada política con ≥ 1 test positivo y ≥ 1 negativo                                           | `npm run test:sql`                                                  | La seguridad de datos es de las políticas              |
| Accesibilidad                                                                  | **0 violaciones axe** (todas las rutas, claro y oscuro)                                      | `npm run test:a11y`                                                 | Brief §11 (WCAG AA)                                    |
| Performance (mobile)                                                           | **Lighthouse ≥ 90** en `/`, `/menu`, `/checkout`, `/pedido/:codigo`; **LCP < 2,5 s**         | `npm run lighthouse`                                                | Brief §11; 90 % del tráfico es celular                 |
| Presupuesto de JS inicial (ruta `/`, gzip)                                     | **≤ 165 KB**                                                                                 | `npm run size` (size-limit)                                         | Mantiene LCP en 4G; cocina/admin en chunks lazy aparte |
| Arquitectura                                                                   | Sin imports prohibidos (`lib` no importa React/Supabase; `features` no se importan entre sí) | `npm run deps:check` (dependency-cruiser)                           | Core puro y compartible (ADR-0004)                     |
| Dependencias vulnerables                                                       | 0 _high/critical_ sin excepción registrada                                                   | `osv-scanner scan -r .` + `npm audit --omit=dev`                    | Superficie de ataque pública                           |
| Escaneo de código                                                              | 0 hallazgos _high_                                                                           | Semgrep **solo en CI** (no corre nativo en Windows y no hay Docker) | Ver §6                                                 |

## 4. Métricas solo medidas (no bloquean; se registran y no deben empeorar — _ratchet_)

Se llenan en la Fase 8 con `/constraints ratchet`:

| Métrica                                                                                                     | Hoy                                                                                                                                                         | Nota                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cobertura global de líneas                                                                                  | —                                                                                                                                                           |                                                                                                                                                                                                                                                   |
| Entry JS / CSS (gzip), fin de Fase 7                                                                        | 154 KB / 12 KB                                                                                                                                              | Presupuesto 165 KB / 25 KB. Bajó de 217 KB separando el cliente liviano de Supabase (`src/lib/supabase.ts`, sin Auth/Storage) y cargando carrito y hoja de producto bajo demanda                                                                  |
| Lighthouse mobile (perf · a11y · bp · seo), fin de Fase 8, contra mock local de la API, throttling simulado | `/` 100 · 100 · 100 · 100 (LCP 1,4 s) · `/menu` 77 · `/checkout` 84 · `/mis-pedidos` 90 · `/staff/login` 88 (accesibilidad y buenas prácticas 100 en todas) | **Brecha conocida:** perf de `/menu` y `/checkout` y LCP < 2,5 s en simulado (LCP observado real ≈ 0,4 s). Las rutas privadas no puntúan SEO (están en `robots.txt`). Siguiente palanca: shell estático también en checkout y menos JS de entrada |
| Cobertura del core puro, fin de Fase 2                                                                      | 100 % líneas/ramas                                                                                                                                          | `src/lib/{pricing,hours,orderStatus,money,phone}.ts`                                                                                                                                                                                              |
| Tamaño del chunk `/cocina` y `/admin` (gzip)                                                                | —                                                                                                                                                           | Informativo; son lazy                                                                                                                                                                                                                             |
| Tiempo de `check:task`                                                                                      | —                                                                                                                                                           | Objetivo ≤ 90 s                                                                                                                                                                                                                                   |
| Mutation score del core (Stryker)                                                                           | —                                                                                                                                                           | Opcional; se evalúa tras Fase 8                                                                                                                                                                                                                   |

## 5. Cuándo corre cada cosa (por costo)

| Compuerta                               | Qué incluye                                                                                                           | Tiempo objetivo | Comando              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------- |
| **check:fast** (en el ciclo de edición) | typecheck, lint, format check, gitleaks sobre lo cambiado, `sync:shared --check`, `guard`                             | segundos        | `npm run check:fast` |
| **check:task** (al cerrar cada tarea)   | lo anterior + tests relacionados + cobertura de líneas cambiadas + `deps:check`                                       | **≤ 90 s**      | `npm run check:task` |
| **check:full** (review y CI)            | todo: suite completa, cobertura por carpeta, e2e, axe, Lighthouse, size-limit, osv-scanner, `npm audit`, Semgrep (CI) | minutos         | `npm run check:full` |

Comportamiento ante falla: **bloquea** (el agente no da la tarea por terminada). Los umbrales de Lighthouse/axe/size se evalúan recién cuando existe una ruta que los ejercite (desde Fase 4); antes de eso no se inventa un check.

## 6. Herramientas que se instalan (Fase 2)

| Para         | Herramienta                             | Instalación                                                                 |
| ------------ | --------------------------------------- | --------------------------------------------------------------------------- |
| Secrets      | gitleaks (siempre `--redact`)           | ✔ instalado (`gitleaks dir . --redact`; en una shell nueva está en el PATH) |
| Dependencias | osv-scanner                             | ✔ instalado (`osv-scanner scan source -r .`)                                |
| Código       | Semgrep                                 | CI (GitHub Actions); localmente solo vía WSL si se quiere                   |
| A11y         | `@axe-core/playwright`, `vitest-axe`    | npm (devDependencies)                                                       |
| Performance  | Lighthouse (`lighthouse` o `@lhci/cli`) | npm (devDependency)                                                         |
| Bundle       | `size-limit` + `@size-limit/file`       | npm                                                                         |
| Arquitectura | `dependency-cruiser`                    | npm                                                                         |
| Cobertura    | `@vitest/coverage-v8`                   | npm                                                                         |

Si una herramienta no se puede instalar o ejecutar en esta máquina, **se descarta la regla o se mueve a CI y se anota acá**; no se deja un número sin herramienta.

## 7. Excepciones

| Id  | Regla | Dónde | Motivo | Dueño | Vence |
| --- | ----- | ----- | ------ | ----- | ----- |
| —   | —     | —     | —      | —     | —     |

Toda excepción: motivo concreto, dueño y fecha de vencimiento. Sin fecha, no es excepción: es un hueco.

## 8. Cómo cambiar esto

1. Proponer el cambio con el motivo (¿el número es irreal o el código está mal?).
2. Editar este archivo **primero**, en su propio commit/paso.
3. Recién después tocar el código.
