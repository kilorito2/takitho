# ADR-0011: PWA y estrategia offline

## Status
Accepted (pendiente de OK de Fase 0)

## Date
2026-10-21

## Context
La cocina debe ser instalable y tolerar cortes de WiFi; el cliente debe poder ver el menú aunque la señal sea mala. Pero **un pedido nunca se debe crear offline** (precio y horario son del servidor).

## Decision
- `vite-plugin-pwa` con `generateSW` y *runtime caching*:
  - App shell: precache.
  - Menú (GET REST de categorías/productos/modificadores): `StaleWhileRevalidate`, con invalidación por Realtime cuando hay red.
  - Imágenes de Cloudinary: `CacheFirst` con expiración (límite de entradas).
  - Fuentes self-hosted: precache.
  - **Nunca** se cachean `POST` a Edge Functions ni `get-order`.
- Offline: el menú se puede navegar y armar el carrito; el checkout muestra "Sin conexión" y deshabilita el confirmar. Estado de conexión visible.
- Dos manifests: el general (`start_url: /`) y uno de cocina (`/cocina.webmanifest`, `start_url: /cocina`, `display: standalone`, orientación landscape), intercambiado por ruta al cargar `/cocina` para que la tablet instale "Takitho Cocina".
- Actualización del SW con aviso ("Hay una versión nueva") y sin recargar de golpe cuando hay un pedido abierto en cocina.
- Wake Lock API en cocina (con *fallback* silencioso si no está soportada).

## Alternatives Considered
- **Cola offline de pedidos (Background Sync):** riesgo de cobrar precios viejos o fuera de horario. Rechazado.
- **Un único manifest:** la cocina instalaría la raíz del sitio en vez de `/cocina`.

## Consequences
- Hay que probar el flujo de actualización del SW y el comportamiento tras desinstalar/reinstalar.
- vite-plugin-pwa 2.0.0 es reciente: compatibilidad con Vite 8 a verificar en Fase 2.
