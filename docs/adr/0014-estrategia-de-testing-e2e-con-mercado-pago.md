# ADR-0014: Estrategia de testing y E2E del pago con Mercado Pago

## Status
Proposed — **desvío parcial respecto del brief; requiere tu OK**

## Date
2026-10-21

## Context
El brief pide un e2e de "delivery pagado con Mercado Pago en sandbox". El checkout de MP ocurre en un dominio de terceros, con login de usuario de prueba, posibles captchas/2FA y UI que cambia sin aviso: automatizarlo end-to-end en CI es frágil.

## Decision
Dos capas, ambas obligatorias:
1. **E2E automatizado (Playwright), determinista.** Se ejecuta el flujo completo en la app hasta obtener la preferencia (`init_point` de sandbox válido). Luego se simula la notificación: se envía a `mp-webhook` un POST **firmado con el secreto de test** y, como el webhook consulta el pago a la API de MP, la función acepta un `MP_API_BASE` apuntando a un **stub local** (solo permitido cuando `MP_ENV=sandbox`/test, nunca en prod). Se verifica que el pedido pase a `received`, aparezca en cocina y el cliente lo vea cambiar en vivo. También se prueban firma inválida, monto distinto y duplicado.
2. **Prueba manual guiada contra el sandbox real**, con usuarios de prueba (vendedor y comprador) y tarjetas de prueba oficiales, documentada paso a paso en `docs/QA-MERCADOPAGO.md` y validada con la colección de Postman (webhook simulado incluido). Se ejecuta una vez en la Fase 5 y antes del go-live.

Resto de la pirámide: unit del core (alto umbral), componentes, contrato de Edge Functions, pruebas SQL de RLS y transiciones, axe y Lighthouse (ver SPEC §5).

## Alternatives Considered
- **Automatizar el login de MP con Playwright:** frágil y puede violar términos/antibot. Rechazado como parte de CI.
- **Mockear todo MP:** no valida credenciales ni la firma real. Por eso se mantiene la capa manual contra sandbox.

## Consequences
- El criterio A1 se da por cumplido con (1) verde + (2) ejecutado y registrado.
- La función de webhook tiene una pequeña superficie de configuración de test (`MP_API_BASE`) que debe estar bloqueada en producción por variable de entorno y cubierta por un test.
